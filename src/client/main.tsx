import ReactDOM from "react-dom/client";
import { RootApp } from "./RootApp";
import { AuthProvider } from "./AuthContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <RootApp />
  </AuthProvider>
);
