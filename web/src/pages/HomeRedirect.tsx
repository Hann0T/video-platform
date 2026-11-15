import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

/** "/" sends a signed-in user to their own studio. */
export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? `/studio/channel/${user.id}` : "/login"} replace />;
}
