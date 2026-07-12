import React from 'react';

const STYLES = `
  .pm-page { background: #f0e4ea; font-family: 'Segoe UI', system-ui, sans-serif; }
  .pm-page * { box-sizing: border-box; margin: 0; padding: 0; }
  .pm-card {
    margin: 0 auto;
    background: #FDE8EF;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(123,20,72,0.13);
  }

  /* Header */
  .pm-header {
    background: #7B1448;
    padding: 20px 28px 16px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .pm-header-logo {
    background: #FDE8EF;
    border-radius: 10px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 900;
    color: #7B1448;
    letter-spacing: 1px;
  }
  .pm-header-name { color: #fff; font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }

  /* Body */
  .pm-body { padding: 28px 28px 8px; }

  /* Hook */
  .pm-hook {
    font-size: 20px;
    font-weight: 900;
    color: #7B1448;
    line-height: 1.35;
    margin-bottom: 16px;
    border-left: 4px solid #8B1A5A;
    padding-left: 14px;
  }

  /* Lead */
  .pm-lead {
    font-size: 14px;
    color: #4a1030;
    line-height: 1.7;
    margin-bottom: 20px;
  }
  .pm-lead strong { color: #7B1448; }
  .pm-highlight-inline {
    background: #f5c6d8;
    color: #7B1448;
    font-weight: 700;
    border-radius: 4px;
    padding: 1px 6px;
  }

  /* Section title */
  .pm-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 800;
    color: #7B1448;
    margin: 20px 0 12px;
    letter-spacing: 0.3px;
  }
  .pm-section-title .pm-icon {
    width: 28px; height: 28px;
    background: #7B1448;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }

  /* Feature rows */
  .pm-feature {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    background: #fff;
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 10px;
    border-left: 4px solid #8B1A5A;
  }
  .pm-feature-icon { font-size: 22px; flex-shrink: 0; margin-top: 1px; }
  .pm-feature-label { font-size: 15px; font-weight: 800; color: #7B1448; margin-bottom: 4px; }
  .pm-feature-desc { font-size: 14.5px; color: #5a1535; line-height: 1.55; }

  /* Flow row */
  .pm-flow {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .pm-flow-step {
    background: #FDE8EF;
    border: 1.5px solid #d4a0b8;
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 600;
    color: #7B1448;
  }
  .pm-flow-arrow { color: #8B1A5A; font-size: 14px; font-weight: 700; }

  /* Stat row */
  .pm-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin: 20px 0;
  }
  .pm-stat {
    background: #7B1448;
    border-radius: 14px;
    padding: 14px 10px;
    text-align: center;
  }
  .pm-stat-num { font-size: 24px; font-weight: 900; color: #fff; line-height: 1; }
  .pm-stat-label { font-size: 14px; color: #f5c6d8; margin-top: 5px; line-height: 1.4; }

  /* CTA box */
  .pm-cta {
    background: #8B1A5A;
    border-radius: 16px;
    padding: 20px 22px;
    margin: 20px 0 28px;
  }
  .pm-cta-title { font-size: 16px; font-weight: 900; color: #fff; margin-bottom: 8px; }
  .pm-cta-desc { font-size: 14px; color: #f5c6d8; line-height: 1.6; margin-bottom: 14px; }
  .pm-cta-badges { display: flex; gap: 10px; flex-wrap: wrap; }
  .pm-cta-badge {
    background: #FDE8EF;
    color: #7B1448;
    font-size: 12px;
    font-weight: 700;
    border-radius: 20px;
    padding: 6px 16px;
  }

  /* Contact */
  .pm-contact {
    border: 2px solid #d4a0b8;
    border-radius: 16px;
    padding: 18px 22px;
    margin: 20px 0 28px;
    background: #fff;
  }
  .pm-contact-title {
    font-size: 14px;
    font-weight: 800;
    color: #7B1448;
    margin-bottom: 14px;
    text-align: center;
    letter-spacing: 0.3px;
  }
  .pm-contact-rows { display: flex; justify-content: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .pm-contact-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 600;
    color: #5a1535;
    text-decoration: none;
  }
  .pm-contact-row:hover { color: #8B1A5A; }
  .pm-contact-row .pm-contact-ic {
    width: 20px; height: 20px; flex-shrink: 0; color: #7B1448;
  }
  .pm-socials { display: flex; justify-content: center; gap: 14px; }
  .pm-social {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    border-radius: 24px;
    padding: 9px 18px;
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    transition: transform 0.12s ease, opacity 0.12s ease;
  }
  .pm-social:hover { transform: translateY(-1px); opacity: 0.92; }
  .pm-social-zalo { background: #0068FF; }
  .pm-social-fb { background: #1877F2; }
  .pm-social svg { width: 20px; height: 20px; }

  .pm-footer {
    background: #7B1448;
    padding: 12px 28px;
    text-align: center;
    font-size: 11px;
    color: #f5c6d8;
    letter-spacing: 1px;
    font-weight: 600;
  }
`;

export default function LandingPagePersonal() {
    return (
        <div className="pm-page">
            <style>{STYLES}</style>
            <div className="pm-card">
                {/* Header */}
                <div className="pm-header">
                    <div className="pm-header-logo">MEB</div>
                    <div className="pm-header-name">My English Buddy</div>
                </div>

                <div className="pm-body">
                    {/* Hook (Đã đổi sang pain point học viên) */}
                    <div className="pm-hook">
                        ⏱️ Bạn đang mất bao nhiêu ngày chờ đợi chỉ để nhận lại một bài viết/nói được sửa?
                    </div>

                    {/* Lead */}
                    <div className="pm-lead">
                        Học tiếng Anh quan trọng nhất là phải phát hiện và sửa sai ngay lập tức. Tuy nhiên, phần lớn học viên đang bị <span className="pm-highlight-inline">"ngốn" thời gian</span> chờ đợi giáo viên chấm bài tự luận — khiến mạch tư duy và hứng thú học tập bị giảm sút.
                        <br />
                        <br />
                        Đó là lý do chúng tôi mang đến <strong>công cụ học tiếng Anh AI thông minh</strong> giúp bạn sửa bài chi tiết và nâng band nhanh chóng bất kể ngày đêm.
                    </div>

                    {/* What it does */}
                    <div className="pm-section-title">
                        <div className="pm-icon">🤖</div>
                        Nó giúp gì cho lộ trình tự học của bạn?
                    </div>

                    {/* Feature 1 */}
                    <div className="pm-feature">
                        <div className="pm-feature-icon">✍️</div>
                        <div className="pm-feature-content">
                            <div className="pm-feature-label">
                                Sửa bài viết tự động chuyên sâu từ Google Docs
                            </div>
                            <div className="pm-flow">
                                <span className="pm-flow-step">Quét bài viết</span>
                                <span className="pm-flow-arrow">→</span>
                                <span className="pm-flow-step">Phân tích lỗi & từ vựng</span>
                                <span className="pm-flow-arrow">→</span>
                                <span className="pm-flow-step">Gợi ý cách viết hay hơn</span>
                            </div>
                            <div className="pm-feature-desc" style={{ marginTop: "8px" }}>
                                ⚡ Nhận phản hồi chi tiết toàn bộ bài viết trong <strong>&lt;5 phút</strong>, giúp bạn ghi nhớ và khắc phục lỗi sai ngay khi vừa đặt bút xong.
                            </div>
                        </div>
                    </div>

                    {/* Feature 2 */}
                    <div className="pm-feature">
                        <div className="pm-feature-icon">🎙️</div>
                        <div className="pm-feature-content">
                            <div className="pm-feature-label">Chấm Speaking thông minh chuẩn xác</div>
                            <div className="pm-feature-desc">
                                Phân tích lỗi phát âm từng từ · đánh giá độ trôi chảy ngữ điệu · chấm điểm sát sao. Bạn được nghe lại chi tiết để sửa đổi và chuẩn hóa phát âm như người bản xứ.
                            </div>
                        </div>
                    </div>

                    {/* Feature 3 */}
                    <div className="pm-feature">
                        <div className="pm-feature-icon">📋</div>
                        <div className="pm-feature-content">
                            <div className="pm-feature-label">
                                Luyện đề thi TOEIC/IELTS đầy đủ 4 kỹ năng
                            </div>
                            <div className="pm-feature-desc">
                                Mô phỏng phòng thi thực tế · chấm điểm tự động tức thì · xuất báo cáo tiến độ chi tiết nhằm giúp bạn nhìn rõ lỗ hổng kiến thức để bù đắp kịp thời.
                            </div>
                        </div>
                    </div>

                    {/* Feature 4 */}
                    <div className="pm-feature">
                        <div className="pm-feature-icon">📊</div>
                        <div className="pm-feature-content">
                            <div className="pm-feature-label">
                                Theo dõi và đánh giá trình độ định kỳ
                            </div>
                            <div className="pm-feature-desc">
                                Hệ thống lưu trữ và tổng hợp <strong>dữ liệu trực quan</strong> về lịch sử làm bài, giúp bạn luôn chủ động nắm bắt được sự tiến bộ của bản thân mỗi ngày.<br></br>
                                Giáo viên gặp gỡ định kỳ để theo dõi tiến độ và đưa ra những lời khuyên hữu ích giúp bạn cải thiện band điểm nhanh chóng.
                            </div>
                        </div>
                    </div>

                    {/* Stats (Các chỉ số được làm mới lại cho cá nhân học viên) */}
                    <div className="pm-stats">
                        <div className="pm-stat">
                            <div className="pm-stat-num">X3</div>
                            <div className="pm-stat-label">Tốc độ cải thiện band điểm</div>
                        </div>
                        <div className="pm-stat">
                            <div className="pm-stat-num">&lt;5'</div>
                            <div className="pm-stat-label">Có ngay phản hồi bài làm</div>
                        </div>
                        <div className="pm-stat">
                            <div className="pm-stat-num">24/7</div>
                            <div className="pm-stat-label">Học và sửa bài bất cứ lúc nào</div>
                        </div>
                    </div>

                    {/* CTA (Đổi số lượng trung tâm thành số lượng học viên) */}
                    <div className="pm-cta">
                        <div className="pm-cta-title">🎯 Tìm kiếm cho 50 học viên đăng ký sớm nhất.</div>
                        <div className="pm-cta-desc">
                            Tặng voucher giảm <strong style={{ color: "#fff" }}>10% học phí</strong>.
                            <br />
                            Nếu bạn đang tự học IELTS/TOEIC và muốn bứt phá điểm số —{" "}
                            <strong style={{ color: "#fff" }}>
                                inbox hoặc để lại số điện thoại
                            </strong>
                            , tôi sẽ kích hoạt tài khoản ngay trong ngày.
                        </div>
                        <div className="pm-cta-badges">
                            <span className="pm-cta-badge">✅ Hưởng ưu đãi 10%</span>
                            <span className="pm-cta-badge">✅ Học cùng AI kết hợp với giáo viên</span>
                            <span className="pm-cta-badge">✅ Học khôn ngoan, bớt gian nan</span>
                        </div>
                    </div>

                    {/* Contact */}
                    <div className="pm-contact">
                        <div className="pm-contact-title">📞 Liên hệ trải nghiệm ngay</div>
                        <div className="pm-contact-rows">
                            <a className="pm-contact-row" href="tel:0963514484">
                                <svg
                                    className="pm-contact-ic"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                                Phone: 0963514484
                            </a>
                            <a
                                className="pm-contact-row"
                                href="mailto:phamhongha.innerpiece@gmail.com"
                            >
                                <svg
                                    className="pm-contact-ic"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <rect x="2" y="4" width="20" height="16" rx="2" />
                                    <path d="m22 7-10 6L2 7" />
                                </svg>
                                phamhongha.innerpiece@gmail.com
                            </a>
                        </div>
                        <div className="pm-socials">
                            <a
                                className="pm-social pm-social-zalo"
                                href="https://zalo.me/0963514484"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
                                    <path d="M24 4C12.95 4 4 11.66 4 21.11c0 5.37 2.89 10.15 7.41 13.28-.27 1.86-1.09 4.27-2.62 6.16-.45.55-.05 1.38.66 1.3 3.6-.4 6.6-1.86 8.7-3.18 1.84.43 3.78.66 5.85.66 11.05 0 20-7.66 20-17.11C44 11.66 35.05 4 24 4z" />
                                </svg>
                                Zalo
                            </a>
                            <a
                                className="pm-social pm-social-fb"
                                href="https://www.facebook.com/myengbuddy"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z" />
                                </svg>
                                Facebook
                            </a>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="pm-footer">MY ENGLISH BUDDY · SMART WAY TO STUDY</div>
            </div>
        </div>
    );
}