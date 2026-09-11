import {
  KitchenTicketPayload,
  CustomerReceiptPayload,
  DriverControlCopyPayload,
  DineInCustomerTicketPayload,
  DifferentialChangeTicketPayload,
} from '../src/types/printing'
import { renderPrintDocument } from '../src/lib/printing/templates'

console.log('🧪 ========================================================')
console.log('🧪 PHASE 5 — STEP 2: DOCUMENT TEMPLATES VERIFICATION')
console.log('🧪 ========================================================\n')

let passed = 0
let failed = 0

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${testName}`)
    failed++
  }
}

// 1. Test Kitchen Ticket
console.log('--- 1. Testing Kitchen Ticket (KOT) ---')
const kitchenPayload: KitchenTicketPayload = {
  document_type: 'KITCHEN_TICKET',
  order_id: '11111111-1111-1111-1111-111111111111',
  order_number: 1042,
  shift_number: 5,
  order_type: 'delivery',
  shift_sequence_display: 'دليفري #1042',
  items: [
    { name: 'كبدة جملي مخصوص', variant_name: 'كبير', quantity: 2, item_notes: 'بدون بصل / طحينة زيادة' },
    { name: 'طاجن لحمة عكاوي', variant_name: 'افتراضي', quantity: 1 },
  ],
  order_notes: 'تجهيز سريع - العميل في انتظار الدليفري',
  dispatched_at: new Date().toISOString(),
  print_nature: 'ORIGINAL',
}

const renderedKitchen = renderPrintDocument(kitchenPayload)
assert(renderedKitchen.document_type === 'KITCHEN_TICKET', 'Document type is KITCHEN_TICKET')
assert(renderedKitchen.station === 'KITCHEN_80MM', 'Station is KITCHEN_80MM')
assert(!renderedKitchen.rawText.includes('ج.م'), 'Kitchen Ticket strictly omits prices and currency')
assert(renderedKitchen.rawText.includes('كبدة جملي مخصوص'), 'Contains item name')
assert(renderedKitchen.rawText.includes('[ 2 × ]'), 'Contains item quantity formatted')
assert(renderedKitchen.rawText.includes('بدون بصل / طحينة زيادة'), 'Contains item note')
assert(renderedKitchen.html.includes('تذكرة تحضير مطبخ'), 'HTML contains KOT header')

// 2. Test Customer Receipt (Takeaway)
console.log('\n--- 2. Testing Customer Receipt (Takeaway) ---')
const customerPayload: CustomerReceiptPayload = {
  document_type: 'CUSTOMER_RECEIPT',
  order_id: '22222222-2222-2222-2222-222222222222',
  order_number: 1043,
  shift_number: 5,
  order_type: 'takeaway',
  shift_sequence_display: 'استلام سفري: #027',
  customer_name: 'وائل كمال',
  customer_phone: '01012345678',
  delivery_address: null,
  items: [
    { name: 'حواوشي بلدي', variant_name: 'سوبر', quantity: 3, unit_price: 50, subtotal: 150 },
    { name: 'كفتة مشوية', variant_name: 'نصف كيلو', quantity: 1, unit_price: 180, subtotal: 180 },
  ],
  subtotal_amount: 330,
  delivery_fee: 0,
  total_amount: 330,
  payment_method: 'cash',
  created_by_staff: 'مصطفى كاشير',
  created_at: new Date().toISOString(),
  print_nature: 'ORIGINAL',
}

const renderedCustomer = renderPrintDocument(customerPayload)
assert(renderedCustomer.document_type === 'CUSTOMER_RECEIPT', 'Document type is CUSTOMER_RECEIPT')
assert(renderedCustomer.station === 'CASHIER_80MM', 'Station is CASHIER_80MM')
assert(renderedCustomer.rawText.includes('330.00 ج.م'), 'Contains formatted total price')
assert(renderedCustomer.rawText.includes('استلام سفري: #027'), 'Contains shift sequence')
assert(renderedCustomer.rawText.includes('وائل كمال'), 'Contains customer name')
assert(renderedCustomer.html.includes('فاتورة بيع'), 'HTML contains customer receipt title')

// 3. Test Driver Control Copy (Delivery Financial Settlement)
console.log('\n--- 3. Testing Driver Control Copy (Driver & Financial Settlement) ---')
const driverPayload: DriverControlCopyPayload = {
  document_type: 'DRIVER_CONTROL_COPY',
  order_id: '33333333-3333-3333-3333-333333333333',
  order_number: 1044,
  shift_number: 5,
  trip_number: 12,
  driver_name: 'أحمد محمود',
  driver_phone: '01122334455',
  customer_name: 'سامي علي',
  customer_phone: '01299887766',
  delivery_address: 'شارع النصر - عمارة 14 - الدور 3',
  amount_to_collect: 250, // total_amount in DB is 250 (already includes 20 EGP delivery fee)
  payment_method: 'cash',
  created_by_staff: 'مصطفى كاشير',
  dispatched_at: new Date().toISOString(),
  print_nature: 'ORIGINAL',
}

const renderedDriver = renderPrintDocument(driverPayload)
assert(renderedDriver.document_type === 'DRIVER_CONTROL_COPY', 'Document type is DRIVER_CONTROL_COPY')
assert(renderedDriver.station === 'CASHIER_80MM', 'Station is CASHIER_80MM')
assert(renderedDriver.rawText.includes('الطيار المسؤول: أحمد محمود'), 'Driver name prominently highlighted')
assert(renderedDriver.rawText.includes('250.00 ج.م'), 'Amount to collect equals DB total_amount without duplicate delivery fee')
assert(renderedDriver.rawText.includes('رحلة دليفري رقم: #12'), 'Trip number included')

// 4. Test Dine-In Customer Ticket
console.log('\n--- 4. Testing Dine-In Customer Ticket (Turn # & Hall) ---')
const dineInPayload: DineInCustomerTicketPayload = {
  document_type: 'DINE_IN_CUSTOMER_TICKET',
  order_id: '44444444-4444-4444-4444-444444444444',
  order_number: 1045,
  shift_number: 5,
  turn_number: 15,
  turn_display: 'TURN #015',
  customer_name: 'كريم حسن',
  party_size: 4,
  items: [
    { name: 'مشويات مشكل', variant_name: 'كيلو', quantity: 1, unit_price: 450, subtotal: 450 },
  ],
  total_amount: 450,
  payment_method: 'card',
  created_by_staff: 'مصطفى كاشير',
  created_at: new Date().toISOString(),
  print_nature: 'ORIGINAL',
}

const renderedDineIn = renderPrintDocument(dineInPayload)
assert(renderedDineIn.document_type === 'DINE_IN_CUSTOMER_TICKET', 'Document type is DINE_IN_CUSTOMER_TICKET')
assert(renderedDineIn.rawText.includes('TURN #015'), 'Contains Turn Number')
assert(renderedDineIn.rawText.includes('عدد الأفراد: 4 أفراد'), 'Contains party size')
assert(renderedDineIn.rawText.includes('بطاقة دفع (فيزا)'), 'Displays card payment')

// 5. Test Differential Change Ticket (Kitchen delta)
console.log('\n--- 5. Testing Differential Change Ticket (Modifications) ---')
const changePayload: DifferentialChangeTicketPayload = {
  document_type: 'DIFFERENTIAL_CHANGE_TICKET',
  order_id: '11111111-1111-1111-1111-111111111111',
  order_number: 1042,
  shift_sequence_display: 'دليفري #1042',
  modification_number: 1,
  modified_at: new Date().toISOString(),
  modified_by_staff: 'مشرف الوردية',
  added_items: [
    { name: 'طاجن تورلي باللحمة', variant_name: 'وسط', quantity: 1, item_notes: 'صلصة خفيفة' },
  ],
  removed_items: [
    { name: 'كبدة جملي مخصوص', variant_name: 'كبير', quantity: 1 },
  ],
  updated_items: [
    { name: 'طاجن لحمة عكاوي', variant_name: 'افتراضي', old_quantity: 1, new_quantity: 2 },
  ],
}

const renderedChange = renderPrintDocument(changePayload)
assert(renderedChange.document_type === 'DIFFERENTIAL_CHANGE_TICKET', 'Document type is DIFFERENTIAL_CHANGE_TICKET')
assert(renderedChange.station === 'KITCHEN_80MM', 'Station is KITCHEN_80MM')
assert(renderedChange.rawText.includes('[+] أصناف جديدة'), 'Contains added items section')
assert(renderedChange.rawText.includes('[-] أصناف ملغاة'), 'Contains removed items section')
assert(renderedChange.rawText.includes('[=] تعديل في الكميات'), 'Contains updated quantities section')

// 6. Test Reprint Banner
console.log('\n--- 6. Testing Reprint Visual Marking ---')
const reprintPayload: KitchenTicketPayload = {
  ...kitchenPayload,
  print_nature: 'REPRINT',
  reprint_count: 2,
  reprint_reason: 'تلف الورقة في المطبخ',
}
const renderedReprint = renderPrintDocument(reprintPayload)
assert(renderedReprint.rawText.includes('*** [نسخة معاد طباعتها - REPRINT #2] ***'), 'Text contains bold reprint banner')
assert(renderedReprint.rawText.includes('سبب الإعادة: تلف الورقة في المطبخ'), 'Text contains reprint reason')
assert(renderedReprint.html.includes('reprint-banner'), 'HTML includes reprint banner styling')

console.log('\n=======================================')
console.log(`🏁 RESULTS: ${passed} PASSED, ${failed} FAILED`)
console.log('=======================================')

if (failed > 0) {
  process.exit(1)
}
