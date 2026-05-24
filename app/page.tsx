import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/queries';

export default async function HomePage() {
  const supabase = createClient();
  const user = await getUser(supabase);

  return (
    <div className="flex flex-col items-center text-center px-6">
      <div className="mt-20 mb-6">
        <img src="/noraya.png" alt="Noraya" style={{ height: '280px', width: 'auto' }} className="mx-auto mb-2" />
        <p className="text-xs tracking-[0.25em] text-zinc-600 uppercase mb-12">Political Intelligence Platform</p>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/50 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span className="text-xs text-zinc-500">Private Beta</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-light text-white max-w-xl mx-auto mb-4 leading-relaxed">AI παρακολούθηση, ανάλυση και πρόβλεψη δημόσιου λόγου</h2>
        <p className="text-sm text-zinc-600 max-w-md mx-auto mb-12">Προσαρμοσμένη στις θέσεις του οργανισμού σας.</p>
        <div className="flex gap-3 justify-center mb-16">
          <a href="/onboarding" className="text-sm bg-white text-black px-6 py-2.5 rounded-md hover:bg-zinc-200 transition font-medium">Ξεκινήστε δωρεάν</a>
          <a href="#features" className="text-sm text-zinc-500 px-6 py-2.5 rounded-md border border-zinc-800 hover:border-zinc-600 transition">Μάθετε περισσότερα</a>
        </div>
      </div>
      <div id="features" className="w-full max-w-4xl mb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-800/50 rounded-xl overflow-hidden border border-zinc-800/50">
          <div className="bg-zinc-950 p-6 text-left">
            <p className="text-cyan-400 text-lg mb-2">&#9679;</p>
            <p className="text-sm font-medium text-zinc-200 mb-1">Παρακολούθηση Θεμάτων</p>
            <p className="text-xs text-zinc-600 leading-relaxed">Real-time tracking ΜΜΕ, Βουλής και social media. Sentiment analysis και alerts.</p>
          </div>
          <div className="bg-zinc-950 p-6 text-left">
            <p className="text-cyan-400 text-lg mb-2">&#9679;</p>
            <p className="text-sm font-medium text-zinc-200 mb-1">AI Πολιτικός Αναλυτής</p>
            <p className="text-xs text-zinc-600 leading-relaxed">Ρωτήστε οτιδήποτε. AI ανάλυση με βάση τα δεδομένα και τις θέσεις σας.</p>
          </div>
          <div className="bg-zinc-950 p-6 text-left">
            <p className="text-cyan-400 text-lg mb-2">&#9679;</p>
            <p className="text-sm font-medium text-zinc-200 mb-1">Απομόνωση Δεδομένων</p>
            <p className="text-xs text-zinc-600 leading-relaxed">Κάθε οργανισμός βλέπει μόνο τα δικά του. Audit trail, GDPR.</p>
          </div>
        </div>
      </div>
      <div className="mb-16">
        <p className="text-xs tracking-[0.2em] text-zinc-700 uppercase mb-4">Για ποιον</p>
        <div className="flex flex-wrap justify-center gap-2">
          {['Πολιτικά Κόμματα', 'Βουλευτές', 'Think Tanks', 'NGOs', 'Public Affairs', 'Συνδικάτα'].map((item) => (
            <span key={item} className="px-3 py-1 rounded-full border border-zinc-800 text-xs text-zinc-500">{item}</span>
          ))}
        </div>
      </div>
      <div className="mb-20 max-w-lg">
        <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-900/30">
          <p className="text-lg text-white mb-2">Ενδιαφέρεστε;</p>
          <p className="text-sm text-zinc-500 mb-6">Επικοινωνήστε μαζί μας για pilot ή demo.</p>
          <a href="mailto:viewscoperesearch@gmail.com" className="text-sm bg-white text-black px-6 py-2.5 rounded-md hover:bg-zinc-200 transition font-medium">viewscoperesearch@gmail.com</a>
        </div>
      </div>
    </div>
  );
}
