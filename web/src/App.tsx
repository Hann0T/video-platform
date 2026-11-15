import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { AuthPage } from "./pages/AuthPage";
import { FeedPage } from "./pages/FeedPage";
import { StatusPage } from "./pages/StatusPage";
import { StudioChannelPage } from "./pages/StudioChannelPage";
import { StudioCreatePage } from "./pages/StudioCreatePage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/feed" replace />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/studio/channel/:userId" element={<StudioChannelPage />} />
          <Route path="/studio/channel/:userId/create" element={<StudioCreatePage />} />
        </Route>
      </Route>
      <Route path="*" element={<StatusPage title="404" message="Page not found." />} />
    </Routes>
  );
}
