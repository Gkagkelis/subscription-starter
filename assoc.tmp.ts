import { associationBenchmark } from '@/lib/synthetic-lab/benchmark/assoc';
import { PRODUCTION_MODEL } from '@/lib/synthetic-lab/engine/model-config';
(async () => {
  // calibration μόνο: επιλογή ρ
  for (const rho of [0, 0.1, 0.2, 0.3, 0.45]) {
    const r = await associationBenchmark({ model: { ...PRODUCTION_MODEL, version: `rho${rho}`, batteryRho: rho }, splits: ['calibration'] });
    console.log('rho', rho, JSON.stringify(r.bySplit));
  }
})();
