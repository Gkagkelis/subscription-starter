import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email, name, role } = await req.json();

    if (!email) {
      return NextResponse.json({ ok: false, error: "No email" }, { status: 400 });
    }

    const roleText =
      role === "political_party"
        ? "Πολιτικό Κόμμα"
        : role === "mp_candidate"
        ? "Υποψήφιος Βουλευτής"
        : "Νέος χρήστης";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Noraya <onboarding@resend.dev>",
        to: [email],
        subject: "Καλώς ήρθες στη Noraya",
        html: `
          <div style="background:#060a14;color:#f1f5f9;font-family:Arial,sans-serif;padding:40px;text-align:center;">
            <div style="font-size:24px;color:#22d3ee;font-weight:bold;letter-spacing:0.15em;">NORAYA</div>
            <div style="font-size:11px;color:#475569;letter-spacing:0.2em;">POLITICAL INTELLIGENCE</div>
            <h1 style="margin-top:30px;font-size:22px;">Καλώς ήρθες, ${name || "συνάδελφε"}</h1>
            <p style="color:#94a3b8;font-size:14px;margin-top:12px;">
              Η εγγραφή σου ως <strong style="color:#22d3ee;">${roleText}</strong> ολοκληρώθηκε.<br>
              Ο Noraya είναι έτοιμος να δουλέψει για σένα.
            </p>
            <div style="margin-top:30px;text-align:left;max-width:400px;margin-left:auto;margin-right:auto;">
              <div style="border-bottom:1px solid rgba(255,255,255,0.06);padding:12px 0;">
                <div style="font-size:14px;color:#e2e8f0;">1. Ολοκλήρωσε το προφίλ σου</div>
                <div style="font-size:12px;color:#64748b;">Πες μας ποιος είσαι για να μιλάμε για σένα.</div>
              </div>
              <div style="border-bottom:1px solid rgba(255,255,255,0.06);padding:12px 0;">
                <div style="font-size:14px;color:#e2e8f0;">2. Δες το Strategy Room</div>
                <div style="font-size:12px;color:#64748b;">Η ημερήσια ανάλυση και οι προτεραιότητες.</div>
              </div>
              <div style="padding:12px 0;">
                <div style="font-size:14px;color:#e2e8f0;">3. Ρώτησε τον Advisor</div>
                <div style="font-size:12px;color:#64748b;">Ό,τι σε απασχολεί — από δελτίο τύπου μέχρι στρατηγική.</div>
              </div>
            </div>
            <a href="https://noraya.vercel.app/onboarding" style="display:inline-block;background:#22d3ee;color:#060a14;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:600;margin-top:20px;">
              Ξεκίνα τώρα →
            </a>
            <p style="color:#475569;font-size:11px;margin-top:30px;">
              Noraya · Political Intelligence Platform
            </p>
          </div>
        `,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
