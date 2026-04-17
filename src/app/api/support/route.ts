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

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('Credenciais de e-mail não configuradas');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

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
      subject: `[Suporte] Mensagem de ${name}`,
      html: `
        <h2>Nova mensagem de suporte</h2>
        <p><strong>Nome:</strong> ${name}</p>
        <p><strong>E-mail:</strong> ${email}</p>
        <p><strong>Mensagem:</strong></p>
        <p style="white-space:pre-wrap">${message}</p>
        <hr/>
        <p style="color:#888;font-size:12px">Enviado via WellNutriAI — ID do usuário: ${user.id}</p>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[support] error:', err);
    return NextResponse.json({ error: 'Falha ao enviar mensagem. Tente novamente.' }, { status: 500 });
  }
}
