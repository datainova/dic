type SendResult = { ok: true; messageId: string } | { ok: false; reason: string }

function getSmtpConfig() {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.EMAIL_FROM || 'DataInova <no-reply@data-inova.app>'
  if (!host || !user || !pass) {
    return null
  }
  return { host, port, secure, auth: { user, pass }, from }
}

export async function sendEmailLink(to: string, link: string): Promise<SendResult> {
  const cfg = getSmtpConfig()
  if (!cfg) {
    // Dev fallback: log to console when SMTP is not configured
    // eslint-disable-next-line no-console
    console.log(`\n[Email DEV] To: ${to}\nLink: ${link}\n(Configure SMTP_* env vars to send real emails)\n`)
    return { ok: true, messageId: 'dev-fallback' }
}

export async function sendResetLink(to: string, link: string): Promise<SendResult> {
  const cfg = getSmtpConfig()
  if (!cfg) {
    console.log(`\n[Email DEV] (Reset) To: ${to}\nLink: ${link}\n(Configure SMTP_* env vars to send real emails)\n`)
    return { ok: true, messageId: 'dev-fallback' }
  }
  const mod: any = await import('nodemailer').catch(() => null)
  if (!mod) return { ok: false, reason: 'nodemailer_not_installed' }
  const nodemailer = (mod as any).default || mod
  const transporter = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.auth })

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px">
    <h2 style="margin:0 0 12px 0;color:#111">Redefinir senha</h2>
    <p style="margin:0 0 16px 0;color:#333">Clique abaixo para definir uma nova senha da sua conta.</p>
    <p><a href="${link}" style="display:inline-block;background:#2d91ff;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Definir nova senha</a></p>
    <p style="margin:16px 0 0 0;color:#666;font-size:12px">Se o botão não funcionar, copie e cole este link no navegador:<br/>${link}</p>
  </div>`

  const info = await transporter.sendMail({
    from: cfg.from,
    to,
    subject: 'Redefinição de senha — DataInova',
    text: `Redefina sua senha com este link: ${link}`,
    html,
    envelope: { from: cfg.auth.user, to }
  })
  return { ok: true, messageId: info.messageId }
}

  // Lazy-load nodemailer only when SMTP is configured to avoid runtime dependency in dev
  const mod: any = await import('nodemailer').catch(() => null)
  if (!mod) {
    return { ok: false, reason: 'nodemailer_not_installed' }
  }
  const nodemailer = (mod as any).default || mod
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  })

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px">
    <h2 style="margin:0 0 12px 0;color:#111">Concluir cadastro</h2>
    <p style="margin:0 0 16px 0;color:#333">Clique no botão abaixo para confirmar seu e-mail e acessar sua conta DataInova.</p>
    <p><a href="${link}" style="display:inline-block;background:#2d91ff;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Confirmar e acessar</a></p>
    <p style="margin:16px 0 0 0;color:#666;font-size:12px">Se o botão não funcionar, copie e cole este link no navegador:<br/>${link}</p>
  </div>`

  const info = await transporter.sendMail({
    from: cfg.from,
    to,
    subject: 'Seu link de acesso — DataInova',
    text: `Acesse sua conta com este link: ${link}`,
    html,
    // Some SMTPs require the envelope sender to match the authenticated user
    envelope: { from: cfg.auth.user, to: to }
  })

  return { ok: true, messageId: info.messageId }
}
