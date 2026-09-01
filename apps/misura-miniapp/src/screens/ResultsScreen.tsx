import { useState } from "react";
import { AvatarViewer } from "../components/AvatarViewer";
import { genericSizeChart, recommendSizeAcrossBrands, type SizeChart } from "../measure/sizeChart";
import { haptic, saveProfileToCloud } from "../telegram/webapp";
import { useScan } from "../state/ScanContext";

// MVP demo: a second brand chart with tighter (slim-fit) sizing than the
// generic chart, so the UI genuinely demonstrates "Sei una M per questo
// brand, S per questo altro" from the product spec (§4) rather than
// hardcoding a single label.
const SLIM_FIT_CHART: SizeChart = {
  brand: "slim-fit",
  ranges: genericSizeChart.ranges.map((r) => ({
    ...r,
    chestMax: r.chestMax - 5,
    waistMax: r.waistMax - 5,
    hipsMax: r.hipsMax - 5,
  })),
};

function randomProfileId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function ResultsScreen() {
  const { state, dispatch } = useScan();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const measurements = state.measurements;
  if (!measurements) return null;

  const sizes = recommendSizeAcrossBrands(measurements, [genericSizeChart, SLIM_FIT_CHART]);

  async function handleSave() {
    if (!measurements) return;
    setSaving(true);
    try {
      const id = state.profileId ?? randomProfileId();
      await saveProfileToCloud(
        id,
        JSON.stringify({ measurements, savedAt: new Date().toISOString() }),
      );
      dispatch({ type: "SET_PROFILE_ID", profileId: id });
      setSaved(true);
      haptic("success");
      dispatch({ type: "GOTO", step: "profile" });
    } catch {
      haptic("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen screen--results">
      <h2>Le tue misure</h2>
      <div className="measurements">
        <div className="measurements__item">
          <span className="measurements__label">Petto</span>
          <span className="measurements__value">{measurements.chest} cm</span>
        </div>
        <div className="measurements__item">
          <span className="measurements__label">Vita</span>
          <span className="measurements__value">{measurements.waist} cm</span>
        </div>
        <div className="measurements__item">
          <span className="measurements__label">Fianchi</span>
          <span className="measurements__value">{measurements.hips} cm</span>
        </div>
      </div>

      <AvatarViewer measurements={measurements} />

      <div className="size-results">
        {sizes.map((s) => (
          <div key={s.brand} className="size-results__item">
            <span>{s.brand}</span>
            <strong>{s.size}</strong>
          </div>
        ))}
      </div>

      <button className="button button--primary" onClick={handleSave} disabled={saving}>
        {saving ? "Salvataggio…" : saved ? "Salvato ✓ — vai al profilo" : "Salva profilo"}
      </button>
      <button className="button button--secondary" onClick={() => dispatch({ type: "RESET" })}>
        Rifai la scansione
      </button>
    </div>
  );
}
