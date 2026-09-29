import { NextResponse } from "next/server";
import { stripe } from "@/utils/stripe/config";
import { getURL } from "@/utils/helpers";
import { athensDay, hasDayPass, logPilotError, pilotAuth, pilotConfig, sendAlert } from "@/lib/noraya/pilot";

export const dynamic = "force-dynamic";

// «Πλήρες ξεκλείδωμα ημέρας»: δημιουργεί πληρωμή Stripe (κάρτα) και επιστρέφει
// το link. Το ξεκλείδωμα καταγράφεται από το webhook μόλις ολοκληρωθεί η πληρωμή.
// Αν δεν έχει ρυθμιστεί Stripe, στέλνει email στον ιδιοκτήτη ως αίτημα.
export async function POST() {
  const auth = await pilotAuth("/api/pilot/day-pass", "auto");
  if (auth.response) return auth.response;
  const caller = auth.caller;

  const day = athensDay();
  const eur = pilotConfig.dayPassEur();

  if (await hasDayPass(caller.scope, day)) {
    return NextResponse.json({ ok: true, already: true, message: "Το ξεκλείδωμα για σήμερα είναι ήδη ενεργό." });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    await sendAlert(
      `daypass-request:${caller.scope}:${day}`,
      `Noraya: αίτημα ξεκλειδώματος ημέρας (${caller.scope})`,
      `<p>Ο χρήστης ${caller.email || caller.userId} (${caller.scope}) ζήτησε πλήρες ξεκλείδωμα για ${day} (€${eur}).</p>
       <p>Η πληρωμή με κάρτα δεν έχει ρυθμιστεί. Μπορείς να το ενεργοποιήσεις χειροκίνητα από τη σελίδα /admin/pilot.</p>`
    );
    return NextResponse.json({
      ok: true,
      manual: true,
      message: "Το αίτημά σας στάλθηκε. Θα επικοινωνήσουμε μαζί σας άμεσα για την ενεργοποίηση."
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Μόνο κάρτα: η πληρωμή ολοκληρώνεται αμέσως και το ξεκλείδωμα γίνεται άμεσα.
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: Math.round(eur * 100),
            product_data: {
              name: "Noraya — Πλήρες ξεκλείδωμα ημέρας",
              description: `Απεριόριστη χρήση όλων των λειτουργιών για ${day} (κάλυψη κόστους επεξεργασίας με προηγμένα μοντέλα AI).`
            }
          }
        }
      ],
      customer_email: caller.email || undefined,
      metadata: {
        kind: "noraya_day_pass",
        scope: caller.scope,
        day,
        user_id: caller.userId || "",
        amount_eur: String(eur)
      },
      success_url: getURL("/strategy-room?daypass=ok"),
      cancel_url: getURL("/strategy-room?daypass=cancel")
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    await logPilotError("/api/pilot/day-pass", e, { scope: caller.scope }, caller.userId);
    return NextResponse.json(
      { ok: false, error: "Η πληρωμή δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκιμάστε σε λίγο ή επικοινωνήστε μαζί μας." },
      { status: 500 }
    );
  }
}
