import { useState } from "react";
import "./App.css";
import JsonDiffTool from "./components/JsonDiffTool";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <JsonDiffTool />
    </>
  );
}

export default App;
