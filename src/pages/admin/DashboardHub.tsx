import Dashboard from "./Dashboard";
import Scraper from "./Scraper";

export default function DashboardHub() {
  return (
    <div className="motion-rise space-y-6">
      <Dashboard />
      <div className="motion-rise border-t pt-4">
        <Scraper />
      </div>
    </div>
  );
}
