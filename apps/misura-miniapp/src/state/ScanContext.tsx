import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { CalibrationScale } from "../measure/calibration";
import type { BodyMeasurementsCm } from "../measure/sizeChart";

export type ScanStep = "welcome" | "scan" | "processing" | "results" | "profile";

export interface ScanState {
  step: ScanStep;
  consentGiven: boolean;
  calibration: CalibrationScale | null;
  bodyFrameDataUrl: string | null;
  measurements: BodyMeasurementsCm | null;
  profileId: string | null;
  error: string | null;
}

type Action =
  | { type: "GRANT_CONSENT" }
  | { type: "SET_CALIBRATION"; calibration: CalibrationScale }
  | { type: "SET_BODY_FRAME"; dataUrl: string }
  | { type: "SET_MEASUREMENTS"; measurements: BodyMeasurementsCm }
  | { type: "SET_PROFILE_ID"; profileId: string }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "GOTO"; step: ScanStep }
  | { type: "RESET" };

const initialState: ScanState = {
  step: "welcome",
  consentGiven: false,
  calibration: null,
  bodyFrameDataUrl: null,
  measurements: null,
  profileId: null,
  error: null,
};

function reducer(state: ScanState, action: Action): ScanState {
  switch (action.type) {
    case "GRANT_CONSENT":
      return { ...state, consentGiven: true, step: "scan" };
    case "SET_CALIBRATION":
      return { ...state, calibration: action.calibration, error: null };
    case "SET_BODY_FRAME":
      return { ...state, bodyFrameDataUrl: action.dataUrl, step: "processing", error: null };
    case "SET_MEASUREMENTS":
      return { ...state, measurements: action.measurements, step: "results" };
    case "SET_PROFILE_ID":
      return { ...state, profileId: action.profileId };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "GOTO":
      return { ...state, step: action.step };
    case "RESET":
      return { ...initialState, consentGiven: state.consentGiven };
    default:
      return state;
  }
}

interface ScanContextValue {
  state: ScanState;
  dispatch: React.Dispatch<Action>;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan deve essere usato dentro <ScanProvider>");
  return ctx;
}
