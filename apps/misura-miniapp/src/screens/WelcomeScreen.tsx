import { ConsentGate } from "../components/ConsentGate";
import { useScan } from "../state/ScanContext";

export function WelcomeScreen() {
  const { dispatch } = useScan();

  return (
    <div className="screen screen--welcome">
      <h1>MISURA</h1>
      <p className="tagline">Dalla chat alla taglia perfetta in 10 secondi.</p>
      <ConsentGate onAccept={() => dispatch({ type: "GRANT_CONSENT" })} />
    </div>
  );
}
