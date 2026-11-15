import { Link } from "react-router-dom";

export default function GuestBadge() {
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-100"
      role="status"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-300" />
      <span>Guest mode, searches not saved</span>
      <span aria-hidden="true" className="text-amber-200/40">·</span>
      <Link to="/auth?mode=signup" className="font-medium text-amber-200 underline-offset-2 hover:underline">
        Create account
      </Link>
    </div>
  );
}
