export const welcomeEmailTemplate = (userName: string) => `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 48px 24px; color: #1a1a1a;">

  <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 32px 0;">Aamenn</h1>

  <p style="font-size: 16px; line-height: 1.7; color: #333; margin: 0 0 16px 0;">Hi ${userName},</p>

  <p style="font-size: 16px; line-height: 1.7; color: #333; margin: 0 0 32px 0;">
    Your vault is ready. Everything you upload is encrypted on your device — we never see your files.
  </p>

  <a href="https://web.aamenn.com"
     style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 500;">
    Open Vault
  </a>

  <p style="font-size: 13px; color: #999; margin: 48px 0 0 0; border-top: 1px solid #eee; padding-top: 24px;">
    Questions? Just reply to this email.<br/>— The Aamenn Team
  </p>

</div>
`;