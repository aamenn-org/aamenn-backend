// Debug script to check mail configuration
const { config } = require('dotenv');
config();

console.log('=== Environment Variables Debug ===');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASS length:', process.env.SMTP_PASS?.length || 0);
console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
console.log('VAULT_RESET_OTP_TTL_SECONDS:', process.env.VAULT_RESET_OTP_TTL_SECONDS);
console.log('VAULT_RESET_SESSION_TTL_SECONDS:', process.env.VAULT_RESET_SESSION_TTL_SECONDS);
console.log('REDIS_HOST:', process.env.REDIS_HOST);
console.log('REDIS_PORT:', process.env.REDIS_PORT);
console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '***SET***' : 'NOT SET');
console.log('=====================================');

// Test nodemailer directly
const nodemailer = require('nodemailer');

async function testEmail() {
  console.log('\n=== Testing Nodemailer Directly ===');
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: parseInt(process.env.SMTP_PORT || '587') === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    console.log('Verifying connection...');
    await transporter.verify();
    console.log('✅ Connection verified successfully');
    
    console.log('Sending test email...');
    const result = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.SMTP_USER, // Send to yourself for testing
      subject: '🧪 Aamenn Email Test',
      text: 'This is a test email from Aamenn backend.',
      html: '<p>This is a <strong>test email</strong> from Aamenn backend.</p>',
    });
    
    console.log('✅ Email sent successfully:', result.messageId);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

testEmail();
