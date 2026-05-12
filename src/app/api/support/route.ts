import { rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  message: z.string().min(10).max(2000),
});

// Escapa caracteres HTML para evitar injeção no corpo do e-mail
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('Credenciais de e-mail não configuradas');
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Rate limit: 5 mensagens de suporte por hora por usuário
  if (!rateLimit(`support:${user.id}`, 5, 3600)) {
    return NextResponse.json({ error: 'Muitas mensagens enviadas. Tente novamente em breve.' }, { status: 429 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const { name, email, message } = parsed.data;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"WellNutriAI Suporte" <${process.env.GMAIL_USER}>`,
      to: 'wellnutriai@gmail.com',
      replyTo: email,
      subject: `[Suporte] Mensagem de ${escapeHtml(name)}`,
      html: `
        <h2>Nova mensagem de suporte</h2>
        <p><strong>Nome:</strong> ${escapeHtml(name)}</p>
        <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
        <p><strong>Mensagem:</strong></p>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
        <hr/>
        <p style="color:#888;font-size:12px">Enviado via WellNutriAI</p>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[support] error:', (err as Error).message);
    return NextResponse.json({ error: 'Falha ao enviar mensagem. Tente novamente.' }, { status: 500 });
  }
}
