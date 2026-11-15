import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/** Shared page frame: top navigation + the routed page. */
export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <strong>VidStream</strong>
        <nav>
          <Link to="/feed">Feed</Link>
          {user && <Link to={`/studio/channel/${user.id}`}>My studio</Link>}
        </nav>
        <span className="muted">{user?.email}</span>
        <button className="secondary" onClick={() => void logout()}>
          Sign out
        </button>
      </header>
      <Outlet />
    </div>
  );
}
