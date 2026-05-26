<header className="mb-8">
  <div className="mb-4 flex items-center gap-3">
    <img
      src="/noraya-eye.png"
      alt="Noraya"
      className="h-11 w-11 object-contain"
    />

    <div>
      <div className="text-xs uppercase tracking-[0.25em] text-cyan-300">
        NORAYA
      </div>
      <div className="text-xs text-zinc-500">
        AI Political Advisor
      </div>
    </div>
  </div>

  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
        Τι πρέπει να προσέξετε σήμερα
      </h1>

      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
        Ο Noraya μεταφράζει την τρέχουσα πολιτική ατζέντα σε πρακτική
        σύσταση, με βάση το προφίλ που επιλέξατε στο onboarding.
      </p>
    </div>

    <button
      type="button"
      onClick={loadBrief}
      className="w-fit rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15"
    >
      Ανανέωση σύστασης
    </button>
  </div>

  <div className="mt-6 flex flex-wrap gap-3">
    <a
      href="/strategy-room"
      className="inline-flex rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
    >
      Άνοιγμα Strategy Room
    </a>

    <a
      href="/onboarding"
      className="inline-flex rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
    >
      Αλλαγή προφίλ
    </a>
  </div>
</header>
