import "./index.css";
import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";

const MainWindow = lazy(() =>
  import("./app/main-window").then((module) => ({ default: module.MainWindow }))
);
const PetWindow = lazy(() =>
  import("./app/pet-window").then((module) => ({ default: module.PetWindow }))
);

const params = new URLSearchParams(window.location.search);
const isPetSurface = params.has("pet");

if (isPetSurface) {
  document.documentElement.classList.add("pet-surface");
  document.body.classList.add("pet-surface");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      {isPetSurface ? <PetWindow /> : <MainWindow />}
    </Suspense>
  </React.StrictMode>
);
