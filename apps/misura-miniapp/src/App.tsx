import { ProcessingScreen } from "./screens/ProcessingScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { useScan } from "./state/ScanContext";

export function App() {
  const { state } = useScan();

  return (
    <div className="app">
      {state.error && <div className="app__error">{state.error}</div>}
      {state.step === "welcome" && <WelcomeScreen />}
      {state.step === "scan" && <ScanScreen />}
      {state.step === "processing" && <ProcessingScreen />}
      {state.step === "results" && <ResultsScreen />}
      {state.step === "profile" && <ProfileScreen />}
    </div>
  );
}
