import { all, get, run } from '../db/index.js';

/**
 * سرویس پرسش و پاسخ تعاملی محصول با پاسخ کارشناسان (Product Q&A)
 */
export class ProductQnAService {
  /**
   * ثبت پرسش جدید توسط کاربر
   */
  askQuestion({ productId, userId, questionText }) {
    if (!productId || !questionText) {
      throw new Error('شناسه کالا و متن پرسش الزامی است.');
    }

    const id = `qa_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date().toISOString();

    run(
      `INSERT INTO product_qna (id, product_id, user_id, question, answer, is_approved, is_answered, created_at)
       VALUES (?, ?, ?, ?, NULL, 1, 0, ?)`,
      id, productId, userId || null, String(questionText).trim().slice(0, 500), now
    );

    return {
      qna_id: id,
      product_id: productId,
      question: questionText,
      created_at: now
    };
  }

  /**
   * پاسخ‌دهی توسط کارشناس پشتیبانی یا مدیر
   */
  answerQuestion(qnaId, answerText, answeredByStaffId) {
    if (!qnaId || !answerText) {
      throw new Error('شناسه پرسش و متن پاسخ الزامی است.');
    }

    const now = new Date().toISOString();
    run(
      `UPDATE product_qna 
       SET answer = ?, answered_by = ?, is_answered = 1, answered_at = ?
       WHERE id = ?`,
      String(answerText).trim().slice(0, 1000), answeredByStaffId || null, now, qnaId
    );

    return {
      qna_id: qnaId,
      answer: answerText,
      answered_at: now
    };
  }

  /**
   * دریافت پرسش‌ها و پاسخ‌های تأییدشده یک محصول
   */
  getProductQnA(productId) {
    return all(
      `SELECT q.id, q.product_id, q.question, q.answer, q.created_at, q.answered_at,
              u.full_name as author_name, staff.full_name as staff_name
       FROM product_qna q
       LEFT JOIN users u ON q.user_id = u.id
       LEFT JOIN users staff ON q.answered_by = staff.id
       WHERE q.product_id = ? AND q.is_approved = 1
       ORDER BY q.created_at DESC`,
      productId
    );
  }
}

export const productQnAService = new ProductQnAService();
