import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "agent" | "storekeeper" | "accountant" | "distributor";
const ROLES: Role[] = ["admin", "agent", "storekeeper", "accountant", "distributor"];

export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { email: string; password: string; fullName: string; phone?: string; role: Role }) => {
    if (!i.email || !/^\S+@\S+\.\S+$/.test(i.email)) throw new Error("Enter a valid email address");
    if (!i.password || i.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!i.fullName?.trim()) throw new Error("Full name is required");
    if (!ROLES.includes(i.role)) throw new Error("Invalid role");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
    const { data: isManager } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isManager) throw new Error("Only the owner or an administrator can create users");
    if (data.role === "admin" && !isOwner) throw new Error("Only the owner can create administrators");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName.trim() },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create user");
    const id = created.user.id;
    await supabaseAdmin.from("profiles").update({ phone: data.phone?.trim() || null, full_name: data.fullName.trim() }).eq("id", id);
    const { error: re } = await supabaseAdmin.from("user_roles").insert({ user_id: id, role: data.role });
    if (re) throw new Error(re.message);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId, table_name: "auth.users", record_id: id, action: "CREATE_USER",
      new_data: { email: data.email, role: data.role },
    });
    return { id };
  });

export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { userId: string; role: Role }) => {
    if (!ROLES.includes(i.role)) throw new Error("Invalid role");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
    if (!isOwner) throw new Error("Only the owner can change roles");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if (target?.some((r) => r.role === "owner")) throw new Error("The owner's role cannot be changed");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMemberActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { userId: string; active: boolean }) => i)
  .handler(async ({ data, context }) => {
    const { data: isManager } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isManager) throw new Error("Not allowed");
    if (data.userId === context.userId) throw new Error("You cannot deactivate your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if (target?.some((r) => r.role === "owner")) throw new Error("The owner cannot be deactivated");
    const { error } = await supabaseAdmin.from("profiles").update({ is_active: data.active }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.active ? "none" : "876000h" });
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId, table_name: "profiles", record_id: data.userId,
      action: data.active ? "ACTIVATE_USER" : "DEACTIVATE_USER",
    });
    return { ok: true };
  });
