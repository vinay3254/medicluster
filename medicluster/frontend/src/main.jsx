import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { AppStartup } from "./components/SplashScreen";
import "./index.css";
import "./workspace-cards.css";
import "./installPrompt";

function Root() {
  const patientApp = /^\/app(?:\/|$)/.test(window.location.pathname);

  return (
    <AppStartup tagline={patientApp ? "Patient app" : undefined}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </AppStartup>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
