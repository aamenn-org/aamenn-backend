export const welcomeEmailTemplate = (userName: string) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #1a1a1a; font-size: 28px; margin: 0;">Welcome to Aamenn</h1>
    </div>
    
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 24px;">
      <div style="color: white; font-size: 48px; margin-bottom: 16px;">🎉</div>
      <h2 style="color: white; font-size: 20px; margin: 0 0 8px 0;">Your secure vault is ready</h2>
      <p style="color: rgba(255,255,255,0.9; margin: 0; font-size: 14px;">Start uploading and protecting your memories</p>
    </div>
    
    <p style="color: #555; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
      Hi ${userName},<br><br>
      Welcome to Aamenn! Your private vault is now ready. Your files are encrypted with zero-knowledge encryption, meaning only you can access them.
    </p>
    
    <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <h3 style="color: #333; font-size: 16px; margin: 0 0 12px 0;">Quick Start:</h3>
      <ul style="color: #666; font-size: 14px; margin: 0; padding-left: 20px;">
        <li style="margin-bottom: 8px;">📸 Upload your first photos</li>
        <li style="margin-bottom: 8px;">🔐 Your recovery key is your backup</li>
        <li style="margin-bottom: 8px;">📱 Access from any device</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="https://your-app-url.com/photos" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
        Open Your Vault
      </a>
    </div>
    
    <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
      Need help? Reply to this email or visit our help center.
    </p>
    
    <p style="color: #999; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
      — The Aamenn Team
    </p>
  </div>
`;
