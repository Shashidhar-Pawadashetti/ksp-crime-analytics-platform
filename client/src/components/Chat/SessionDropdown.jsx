import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Plus, MessageSquare } from 'lucide-react';

export default function SessionDropdown({ sessions, activeSessionId, onSwitch, onNewChat }) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={activeSessionId || ''}
        onValueChange={(val) => {
          if (val === '__new__') {
            onNewChat();
          } else {
            onSwitch(val);
          }
        }}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Select conversation..." />
        </SelectTrigger>
        <SelectContent>
          {sessions.map((s) => (
            <SelectItem key={s.session_id} value={s.session_id}>
              <span className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[160px]">
                  {s.title || 'New conversation'}
                </span>
              </span>
            </SelectItem>
          ))}
          <SelectItem value="__new__" className="border-t border-border">
            <span className="flex items-center gap-2 text-accent font-medium">
              <Plus className="h-3.5 w-3.5" />
              New Chat
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
