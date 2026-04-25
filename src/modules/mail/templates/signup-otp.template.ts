export const signupOtpEmailTemplate = (otp: string, expiryMinutes: number) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 48px; height: 48px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
        <span style="font-size: 24px;">✉️</span>
      </div>
      <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">Verify Your Email</h1>
    </div>
    
    <p style="color: #555; font-size: 16px; line-height: 1.5; margin-bottom: 24px; text-align: center;">
      Enter the code below to verify your email and create your Aamenn account:
    </p>
    
    <div style="background: #f8f9fa; border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a; font-family: 'Courier New', monospace;">
        ${otp}
      </div>
    </div>
    
    <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="color: #92400e; margin: 0; font-size: 14px; text-align: center;">
        ⏰ This code expires in ${expiryMinutes} minutes
      </p>
    </div>
    
    <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <h3 style="color: #374151; font-size: 14px; margin: 0 0 8px 0;">Security Tips:</h3>
      <ul style="color: #6b7280; font-size: 13px; margin: 0; padding-left: 20px;">
        <li style="margin-bottom: 4px;">Never share this code with anyone</li>
        <li style="margin-bottom: 4px;">We'll never ask for this code by phone</li>
        <li>This is a one-time use code</li>
      </ul>
    </div>
    
    <p style="color: #999; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
      If you didn't request this, you can safely ignore this email.
    </p>
    
    <p style="color: #999; font-size: 12px; text-align: center; margin: 8px 0 0 0;">
      — Aamenn Security
    </p>
  </div>
`;
