import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./styles.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("缺少根节点");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
