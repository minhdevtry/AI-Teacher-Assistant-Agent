import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
});

async function seed() {
  const client = await pool.connect();
  console.log('Connected to Supabase database.');

  try {
    // Clean existing data (order matters due to logical dependencies)
    await client.query('DELETE FROM "AuditLog"');
    await client.query('DELETE FROM "MonthlyClosing"');
    await client.query('DELETE FROM "ChannelEvent"');
    await client.query('DELETE FROM "Payment"');
    await client.query('DELETE FROM "Invoice"');
    await client.query('DELETE FROM "Class"');
    await client.query('DELETE FROM "User"');

    // Reset sequences
    await client.query('ALTER SEQUENCE "User_Id_seq" RESTART WITH 1');
    await client.query('ALTER SEQUENCE "Class_Id_seq" RESTART WITH 1');
    await client.query('ALTER SEQUENCE "Invoice_Id_seq" RESTART WITH 1');
    await client.query('ALTER SEQUENCE "Payment_Id_seq" RESTART WITH 1');

    console.log('Cleaned existing data.');

    // ── Teacher ──
    await client.query(
      `INSERT INTO "User" ("Name", "Code", "Description", "Role", "Phone", "Title", "Nickname", "Timezone")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['Cô Linh', 'TCH001', 'Giáo viên Toán và Anh văn', 'teacher', '0901234567', 'cô', 'Cô Linh', 'Asia/Ho_Chi_Minh'],
    );

    // ── Students (5 across 2 classes) ──
    const students = [
      ['Nguyễn Minh Anh', 'STU001', 'Học sinh lớp Toán 12', 'student', '0911111001', null, 'Minh Anh', 'CLS001', null],
      ['Trần Bảo Khang', 'STU002', 'Học sinh lớp Toán 12', 'student', '0911111002', null, 'Bảo Khang', 'CLS001', null],
      ['Lê Hoàng Duy', 'STU003', 'Học sinh lớp Toán 12', 'student', '0911111003', null, 'Hoàng Duy', 'CLS001', null],
      ['Phạm Thanh Hà', 'STU004', 'Học sinh lớp Anh 11', 'student', '0911111004', null, 'Thanh Hà', 'CLS002', null],
      ['Võ Đức Minh', 'STU005', 'Học sinh lớp Anh 11', 'student', '0911111005', null, 'Đức Minh', 'CLS002', null],
    ];

    for (const s of students) {
      await client.query(
        `INSERT INTO "User" ("Name", "Code", "Description", "Role", "Phone", "Title", "Nickname", "ClassCode", "ParentId", "Timezone")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [...s, 'Asia/Ho_Chi_Minh'],
      );
    }

    // ── Parents ──
    const parents = [
      ['Nguyễn Văn Hùng', 'PAR001', 'Phụ huynh Minh Anh', 'parent', '0922222001', null, 'Ba Hùng', null, 1],
      ['Trần Thị Lan', 'PAR002', 'Phụ huynh Bảo Khang', 'parent', '0922222002', null, 'Mẹ Lan', null, 2],
    ];

    for (const p of parents) {
      await client.query(
        `INSERT INTO "User" ("Name", "Code", "Description", "Role", "Phone", "Title", "Nickname", "ClassCode", "ParentId", "Timezone")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [...p, 'Asia/Ho_Chi_Minh'],
      );
    }

    // Update students with ParentId
    await client.query(`UPDATE "User" SET "ParentId" = (SELECT "Id" FROM "User" u2 WHERE u2."Code" = 'PAR001') WHERE "Code" = 'STU001'`);
    await client.query(`UPDATE "User" SET "ParentId" = (SELECT "Id" FROM "User" u2 WHERE u2."Code" = 'PAR002') WHERE "Code" = 'STU002'`);

    console.log('Inserted users (1 teacher, 5 students, 2 parents).');

    // ── Classes ──
    await client.query(
      `INSERT INTO "Class" ("Name", "Code", "Description", "TeacherCode", "Subject", "FeeAmount", "FeeType", "Schedule", "Status")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['Toán 12', 'CLS001', 'Lớp luyện thi Toán lớp 12', 'TCH001', 'Toán', 800000, 'monthly', 'Chiều T2, T4, T6', 'active'],
    );
    await client.query(
      `INSERT INTO "Class" ("Name", "Code", "Description", "TeacherCode", "Subject", "FeeAmount", "FeeType", "Schedule", "Status")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['Anh 11', 'CLS002', 'Lớp Tiếng Anh lớp 11', 'TCH001', 'Tiếng Anh', 600000, 'monthly', 'Chiều T3, T5', 'active'],
    );

    console.log('Inserted 2 classes.');

    // ── Invoices ──
    const invoices = [
      ['Hóa đơn Minh Anh T7/2026', 'INV001', 'Học phí tháng 7/2026', 'STU001', 'CLS001', '2026-07', 'unpaid', 800000, 0, 800000, '2026-07-10'],
      ['Hóa đơn Bảo Khang T7/2026', 'INV002', 'Học phí tháng 7/2026', 'STU002', 'CLS001', '2026-07', 'paid', 800000, 800000, 0, '2026-07-10'],
      ['Hóa đơn Hoàng Duy T7/2026', 'INV003', 'Học phí tháng 7/2026', 'STU003', 'CLS001', '2026-07', 'partial', 800000, 400000, 400000, '2026-07-10'],
      ['Hóa đơn Thanh Hà T7/2026', 'INV004', 'Học phí tháng 7/2026', 'STU004', 'CLS002', '2026-07', 'unpaid', 600000, 0, 600000, '2026-07-10'],
      ['Hóa đơn Đức Minh T7/2026', 'INV005', 'Học phí tháng 7/2026', 'STU005', 'CLS002', '2026-07', 'unpaid', 600000, 0, 600000, '2026-07-10'],
    ];

    for (const inv of invoices) {
      await client.query(
        `INSERT INTO "Invoice" ("Name", "Code", "Description", "StudentCode", "ClassCode", "BillingMonth", "Status", "TotalAmount", "PaidAmount", "RemainingAmount", "DueDate")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        inv,
      );
    }

    console.log('Inserted 5 invoices.');

    // ── Payments (for paid/partial invoices) ──
    await client.query(
      `INSERT INTO "Payment" ("Name", "Code", "Description", "StudentCode", "InvoiceCode", "TeacherCode", "Amount", "Method", "PaidAt", "Status", "CreatedFrom")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      ['Thanh toán Bảo Khang', 'PAY001', 'Chuyển khoản học phí T7', 'STU002', 'INV002', 'TCH001', 800000, 'bank_transfer', '2026-07-05', 'confirmed', 'manual'],
    );
    await client.query(
      `INSERT INTO "Payment" ("Name", "Code", "Description", "StudentCode", "InvoiceCode", "TeacherCode", "Amount", "Method", "PaidAt", "Status", "CreatedFrom")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      ['Thanh toán Hoàng Duy', 'PAY002', 'Tiền mặt học phí T7 (một phần)', 'STU003', 'INV003', 'TCH001', 400000, 'cash', '2026-07-06', 'confirmed', 'manual'],
    );

    console.log('Inserted 2 payments.');

    // ── Summary ──
    const userCount = await client.query('SELECT COUNT(*) FROM "User"');
    const classCount = await client.query('SELECT COUNT(*) FROM "Class"');
    const invoiceCount = await client.query('SELECT COUNT(*) FROM "Invoice"');
    const paymentCount = await client.query('SELECT COUNT(*) FROM "Payment"');

    console.log('\n=== Seed Complete ===');
    console.log(`Users:    ${userCount.rows[0].count}`);
    console.log(`Classes:  ${classCount.rows[0].count}`);
    console.log(`Invoices: ${invoiceCount.rows[0].count}`);
    console.log(`Payments: ${paymentCount.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
