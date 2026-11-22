import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { MainWindow } from "./app/main-window";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MainWindow />
  </React.StrictMode>
);
