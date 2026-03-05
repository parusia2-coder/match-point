import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'

const app = new Hono<{ Bindings: { DB: D1Database, TOSS_SECRET_KEY: string } }>()

// 1. 결제 승인 확인 (클라이언트 측에서 결제 인증 완료 후 호출됨)
app.post('/confirm', async (c) => {
    const { paymentKey, orderId, amount, tournamentId, participantIds } = await c.req.json()

    // 이 엔드포인트는 토스페이먼츠 서버로 최종 결제 승인을 요청합니다.
    const secretKey = c.env.TOSS_SECRET_KEY || 'test_sk_Z1aOwX7K8m2vKxzQy30b3yQxzvNP'; // 기본 테스트키 사용
    const encryptedSecretKey = btoa(secretKey + ':')

    try {
        const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${encryptedSecretKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                paymentKey,
                orderId,
                amount
            })
        })

        const data = await response.json() as any

        if (!response.ok) {
            return c.json({ error: data.message || '결제 승인 실패' }, 400)
        }

        // 결제 성공! DB 업데이트
        await c.env.DB.prepare(`
      INSERT INTO payment_transactions (tournament_id, amount, payment_key, order_id, status, method)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(tournamentId, amount, paymentKey, orderId, data.status, data.method).run()

        // 참가자들의 상태를 'paid'로 변경
        if (participantIds && participantIds.length > 0) {
            const placeholders = participantIds.map(() => '?').join(',')
            await c.env.DB.prepare(`
        UPDATE participants 
        SET payment_status = 'paid', payment_id = ? 
        WHERE id IN (${placeholders}) AND tournament_id = ?
      `).bind(paymentKey, ...participantIds, tournamentId).run()
        }

        return c.json({ success: true, payment: data })

    } catch (error) {
        return c.json({ error: '서버 에러가 발생했습니다.' }, 500)
    }
})

export default app
