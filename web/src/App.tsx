import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import { AuthPage } from "./pages/AuthPage";
import { HomeRedirect } from "./pages/HomeRedirect";
import { StatusPage } from "./pages/StatusPage";
import { StudioChannelPage } from "./pages/StudioChannelPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/studio/channel/:userId" element={<StudioChannelPage />} />
      </Route>
      <Route path="*" element={<StatusPage title="404" message="Page not found." />} />
    </Routes>
  );
}
