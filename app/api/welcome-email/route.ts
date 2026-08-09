import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email, name, role } = await req.json();

    if (!email) {
      return NextResponse.json({ ok: false, error: "No email" }, { status: 400 });
    }

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Noraya <onboarding@resend.dev>",
        to: [email],
        subject: "Καλώς ήρθες στο Noraya",
        html: `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Noraya</title>
</head>
<body style="margin:0;padding:0;background:#060a14;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#060a14;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#0b1220;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
          <tr>
            <td style="padding:40px 40px 20px;text-align:center;">
              <div style="color:#22d3ee;font-size:24px;font-weight:700;letter-spacing:0.15em;">NORAYA</div>
              <div style="color:#475569;font-size:11px;letter-spacing:0.2em;margin-top:4px;">POLITICAL INTELLIGENCE</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 30px;text-align:center;">
              <h1 style="color:#f1f5f9;font-size:22px;font-weight:600;margin:0;line-height:1.4;">Καλώς ήρθες στο Noraya</h1>
              <p style="color:#94a3b8;font-size:14px;margin-top:12px;line-height:1.6;">Η εγγραφή σου ολοκληρώθηκε.</p>
            </td>
          </tr>
          <tr><td style="padding:0 40px;"><div style="height:1px;background:rgba(255,255,255,0.06);"></div></td></tr>
          <tr>
            <td style="padding:30px 40px;">
              <p style="color:#cbd5e1;font-size:14px;margin:0 0 16px;line-height:1.7;">
                Το Noraya είναι μια πλατφόρμα πολιτικής νοημοσύνης. Συγκεντρώνουμε και αναλύουμε ό,τι συμβαίνει στην πολιτική σκηνή — ειδήσεις, δημοσκοπήσεις, τοπικά γεγονότα, κοινοβουλευτική δράση — και σου δίνουμε μια ξεκάθαρη εικόνα για το τι παίζει και τι σε αφορά.
              </p>
              <p style="color:#cbd5e1;font-size:14px;margin:0;line-height:1.7;">
                Αντί να ψάχνεις σε δεκάδες πηγές, ο Noraya τα κάνει όλα αυτόματα: παρακολουθεί, αναλύει και σου προτείνει τι πρέπει να προσέξεις σήμερα.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 30px;text-align:center;">
              <a href="https://noraya.vercel.app/onboarding" style="display:inline-block;background:#22d3ee;color:#060a14;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:0.02em;">Συνέχεια →</a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.04);">
              <p style="color:#475569;font-size:11px;margin:0;line-height:1.5;">Noraya · Political Intelligence Platform</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
