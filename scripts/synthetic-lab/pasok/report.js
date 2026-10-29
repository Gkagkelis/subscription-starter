// Διαδραστικότητα (μόνο οθόνη): καρτέλες διαστάσεων στους πλήρεις πίνακες διασταυρώσεων.
document.querySelectorAll('details.xt').forEach((box) => {
  box.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    box.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    box.querySelectorAll('.pane').forEach((p) => (p.hidden = p.dataset.k !== b.dataset.k));
  });
});
