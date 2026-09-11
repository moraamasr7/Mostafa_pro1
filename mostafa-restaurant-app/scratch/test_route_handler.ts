import fs from 'fs'
import path from 'path'

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.replace(/\r/g, '').trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=')
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim()
        const val = trimmed.slice(idx + 1).trim()
        process.env[key] = val
      }
    }
  }
}

import { NextRequest } from 'next/server'
import { POST as handleManualOrder } from '../src/app/api/admin/orders/manual/route'
import { ADMIN_COOKIE_NAME } from '../src/app/api/admin/login/route'
import { getSupabaseServerClient } from '../src/lib/supabaseServer'

async function runRouteUnitTests() {
  console.log('🧪 Starting Direct Route Handler Unit Tests for /api/admin/orders/manual...\n')
  const supabase = getSupabaseServerClient()

  const { data: variants } = await supabase
    .from('item_variants')
    .select('id, variant_name, price')
    .eq('is_available', true)
    .limit(1)

  const variantId = variants![0].id

  let passed = 0
  let failed = 0

  function assert(cond: boolean, name: string) {
    if (cond) {
      console.log('  ✅ PASS: ' + name)
      passed++
    } else {
      console.error('  ❌ FAIL: ' + name)
      failed++
    }
  }

  // 1. Unauthorized Request (no cookie)
  console.log('Test 1: Request with no auth cookie...')
  const reqUnauth = new NextRequest('http://localhost:3000/api/admin/orders/manual', {
    method: 'POST',
    body: JSON.stringify({ customer_name: 'تجربة' }),
  })
  const resUnauth = await handleManualOrder(reqUnauth)
  assert(resUnauth.status === 401, 'Returns 401 Unauthorized for missing cookie')

  // Helper to create authorized request
  function createAuthReq(body: any) {
    const req = new NextRequest('http://localhost:3000/api/admin/orders/manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${ADMIN_COOKIE_NAME}=staff_auth_123456789`,
      },
      body: JSON.stringify(body),
    })
    return req
  }

  // 2. Client Total Tampering is completely ignored
  console.log('\nTest 2: Client Total Tampering...')
  const maliciousBody = {
    customer_name: 'عميل يحاول التلاعب بالسعر',
    customer_phone: '01011223344',
    order_type: 'takeaway',
    payment_method: 'cash',
    total_amount: 1.00, // Client tries to force 1 EGP!
    order_source: 'hacked_source', // Client tries to override source
    items: [{ variant_id: variantId, quantity: 2 }],
  }
  const reqTamper = createAuthReq(maliciousBody)
  const resTamper = await handleManualOrder(reqTamper)
  const tamperJson = await resTamper.json()

  assert(resTamper.status === 201, 'Order created successfully')
  assert(tamperJson.order.order_source === 'manual', 'order_source strictly forced to manual')
  assert(tamperJson.order.total_amount > 1.00, 'Client total_amount ignored; server calculated real price (' + tamperJson.order.total_amount + ' EGP)')

  // Clean up order created
  if (tamperJson.order?.id) {
    await supabase.from('order_items').delete().eq('order_id', tamperJson.order.id)
    await supabase.from('orders').delete().eq('id', tamperJson.order.id)
  }

  // 3. Validation failure: Missing customer phone
  console.log('\nTest 3: Missing or Invalid Customer Phone...')
  const reqBadPhone = createAuthReq({
    customer_name: 'عميل بهاتف خطأ',
    customer_phone: '12345',
    order_type: 'takeaway',
    items: [{ variant_id: variantId, quantity: 1 }],
  })
  const resBadPhone = await handleManualOrder(reqBadPhone)
  assert(resBadPhone.status === 400, 'Rejects invalid customer phone format')

  // 4. Validation failure: Delivery missing address
  console.log('\nTest 4: Delivery without valid address...')
  const reqNoAddress = createAuthReq({
    customer_name: 'عميل دليفري',
    customer_phone: '01055556666',
    order_type: 'delivery',
    delivery_address: '123', // < 5 chars
    items: [{ variant_id: variantId, quantity: 1 }],
  })
  const resNoAddress = await handleManualOrder(reqNoAddress)
  assert(resNoAddress.status === 400, 'Rejects delivery order with short/empty address')

  console.log('\n=======================================')
  console.log('🏁 ROUTE TESTS: ' + passed + ' PASSED, ' + failed + ' FAILED')
  console.log('=======================================')

  if (failed > 0) process.exit(1)
}

runRouteUnitTests().catch((e) => {
  console.error(e)
  process.exit(1)
})
