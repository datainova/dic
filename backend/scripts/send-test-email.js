#!/usr/bin/env node
// Quick SMTP test sender using env from backend/.env
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

async function main() {
  const to = process.argv[2] || process.env.SMTP_TEST_TO
  if (!to) {
    console.error('Usage: node scripts/send-test-email.js <recipient@example.com>')
    process.exit(1)
  }
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.EMAIL_FROM || 'DataInova <onboarding@datainova.com.br>'
  if (!host || !user || !pass) {
    console.error('SMTP not configured. Set SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS/EMAIL_FROM in backend/.env')
    process.exit(1)
  }
  const nodemailer = require('nodemailer')
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } })
  try {
    await transporter.verify()
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Teste de SMTP — DataInova',
      text: 'Este é um teste de SMTP da aplicação DataInova.',
      html: '<p>Este é um <b>teste de SMTP</b> da aplicação DataInova.</p>',
      envelope: { from: user, to },
    })
    console.log('SMTP OK. MessageId:', info.messageId)
    if (info.response) console.log('Response:', info.response)
  } catch (e) {
    console.error('SMTP ERROR:', e && e.message ? e.message : e)
    process.exit(2)
  }
}

main()

