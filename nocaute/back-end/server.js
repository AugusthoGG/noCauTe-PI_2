// Esta é a ponte entre o site e o Supabase; as chaves ficam aqui, longe da vitrine.
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseAdminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/+$/, "");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo back-end/.env.");
}

const app = express();
const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../front-end");
// Cliente de login usa a chave pública; o de admin só aparece se a chave secreta existir.
const createAuthClient = () => createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const createAdminClient = () => supabaseAdminKey
  ? createClient(supabaseUrl, supabaseAdminKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
const supabase = createAuthClient();
const createUserClient = (accessToken) => createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${accessToken}` } }
});

// Busca o cadastro que diz quem é a pessoa e se ela pode entrar.
async function getAccountProfile(client, userId) {
  const { data, error } = await client
    .from("profiles")
    .select("role, status, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Falha ao consultar o perfil no Supabase:", error.message);
    throw new Error("Não foi possível consultar o perfil da conta.");
  }
  return data;
}

// Não deixa papel estranho virar passe livre. Aqui não tem carteirinha de faz de conta.
function publicRole(role) {
  return ["aluno", "instrutor", "admin"].includes(role) ? role : "aluno";
}

app.use(cors());
app.use(express.json());
app.use(express.static(frontendDirectory));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Confere a senha no Supabase e compara o perfil escolhido com o perfil de verdade.
app.post("/api/auth/login", async (req, res, next) => {
  const { email, password, expectedRole } = req.body || {};
  if (typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || !password ||
      !["aluno", "instrutor", "admin"].includes(expectedRole)) {
    return res.status(400).json({ error: "Informe e-mail, senha e perfil." });
  }

  try {
    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error?.code === "email_not_confirmed") {
      return res.status(403).json({
        code: "email_not_confirmed",
        error: "Confirme seu e-mail antes de entrar. Você pode solicitar um novo link."
      });
    }

    if (error || !data.session || !data.user) {
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    }

    const profile = await getAccountProfile(authClient, data.user.id);
    if (!profile || profile.status !== "ativo") {
      await authClient.auth.signOut();
      return res.status(403).json({ error: "Esta conta está inativa ou não possui perfil configurado." });
    }

    const role = publicRole(profile.role);
    if (role !== expectedRole) {
      await authClient.auth.signOut();
      return res.status(403).json({ error: "O perfil selecionado não corresponde a esta conta." });
    }

    return res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role,
        fullName: profile.full_name || ""
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Cadastro aberto é só para aluno; instrutor não se promove sozinho, porra.
app.post("/api/auth/register", async (req, res, next) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== "string" || !name.trim() ||
      typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Informe nome, e-mail válido e senha com ao menos 6 caracteres." });
  }

  try {
    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${frontendUrl}/email-confirmed.html`
      }
    });

    if (error) {
      return res.status(error.status === 429 ? 429 : 400)
        .json({ error: "Não foi possível criar a conta. Verifique o e-mail e tente novamente." });
    }

    if (!data.session || !data.user) {
      return res.status(202).json({
        confirmationRequired: true,
        message: "Cadastro iniciado. Confira seu e-mail para confirmar a conta."
      });
    }

    const profile = await getAccountProfile(authClient, data.user.id);
    if (!profile || profile.status !== "ativo") {
      await authClient.auth.signOut();
      return res.status(503).json({ error: "A conta foi criada, mas seu perfil ainda não está disponível. Tente entrar novamente." });
    }

    return res.status(201).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: publicRole(profile.role),
        fullName: profile.full_name || name.trim()
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Reenvia a confirmação sem entregar se um e-mail existe ou não.
app.post("/api/auth/resend-confirmation", async (req, res, next) => {
  const { email } = req.body || {};
  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "Informe seu e-mail." });
  }

  try {
    const { error } = await createAuthClient().auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${frontendUrl}/email-confirmed.html`
      }
    });

    if (error) {
      if (error.status === 429) {
        return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos antes de pedir outro e-mail." });
      }
      console.error("Falha ao reenviar confirmação de cadastro:", error.message);
    }

    return res.json({
      message: "Se houver uma conta pendente para esse e-mail, enviaremos um novo link de confirmação."
    });
  } catch (error) {
    return next(error);
  }
});

// Só convite válido pode trocar a senha por aqui; o segredo admin não sai do servidor.
app.put("/api/auth/password", requireAuth, async (req, res, next) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "A senha deve ter ao menos 6 caracteres." });
  }

  try {
    const adminClient = createAdminClient();
    if (!adminClient) {
      return res.status(503).json({ error: "A configuração segura do Supabase Admin está ausente no backend." });
    }

    const { error } = await adminClient.auth.admin.updateUserById(req.authUser.id, { password });
    if (error) {
      console.error("Falha ao definir senha de usuário convidado:", error.message);
      return res.status(400).json({ error: "Não foi possível definir a senha. Solicite um novo convite." });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

// Troca o passe vencido por um novo, sem pedir a senha de novo.
app.post("/api/auth/refresh", async (req, res, next) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken !== "string" || !refreshToken) {
    return res.status(400).json({ error: "Token de renovação não informado." });
  }

  try {
    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data.session || !data.user) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    const profile = await getAccountProfile(authClient, data.user.id);
    if (!profile || profile.status !== "ativo") {
      await authClient.auth.signOut();
      return res.status(403).json({ error: "Esta conta está inativa ou não possui perfil configurado." });
    }

    return res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: publicRole(profile.role),
        fullName: profile.full_name || ""
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Encerra a sessão no Supabase, além de limpar o que ficou no navegador.
app.post("/api/auth/logout", async (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const { refreshToken } = req.body || {};
  if (!accessToken || typeof refreshToken !== "string" || !refreshToken) {
    return res.status(400).json({ error: "Sessão incompleta." });
  }

  try {
    const authClient = createAuthClient();
    const { error: sessionError } = await authClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (sessionError) {
      return res.status(401).json({ error: "Sessão inválida ou expirada." });
    }

    const { error } = await authClient.auth.signOut();
    if (error) return next(error);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

// Confere o token com o Supabase antes de deixar qualquer rota protegida continuar.
async function requireAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ error: "Token de acesso não informado." });
  }

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error) {
    if (error.status === 401 || error.status === 403) {
      return res.status(401).json({ error: "Token inválido ou expirado." });
    }
    console.error("Falha ao validar token com o Supabase:", error.message);
    return res.status(503).json({ error: "Não foi possível validar a sessão agora." });
  }

  if (!data.user) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }

  req.authUser = data.user;
  req.userClient = createUserClient(match[1]);
  return next();
}

// Devolve só os dados básicos da conta que está usando o site.
app.get("/api/me", requireAuth, async (req, res, next) => {
  try {
    const profile = await getAccountProfile(req.userClient, req.authUser.id);
    if (!profile || profile.status !== "ativo") {
      return res.status(403).json({ error: "Esta conta está inativa ou não possui perfil configurado." });
    }

    return res.json({
      id: req.authUser.id,
      email: req.authUser.email,
      role: publicRole(profile.role),
      fullName: profile.full_name || ""
    });
  } catch (error) {
    return next(error);
  }
});

// A porta admin só abre para perfil ativo de admin; insistir não vira autorização.
async function requireAdmin(req, res, next) {
  const { data: profile, error } = await req.userClient
    .from("profiles")
    .select("role, status")
    .eq("id", req.authUser.id)
    .maybeSingle();

  if (error) {
    console.error("Falha ao verificar perfil administrativo:", error.message);
    return res.status(503).json({ error: "Não foi possível validar as permissões administrativas." });
  }
  if (!profile || profile.role !== "admin" || profile.status !== "ativo") {
    return res.status(403).json({ error: "Acesso restrito a administradores ativos." });
  }
  return next();
}

// Monta a lista de instrutores com os dados do perfil e o e-mail do Auth.
app.get("/api/admin/instructors", requireAuth, requireAdmin, async (_req, res) => {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "Configure SUPABASE_SECRET_KEY no backend para habilitar o painel administrativo." });
  }

  const [{ data: profiles, error: profilesError }, { data: users, error: usersError }] = await Promise.all([
    adminClient.from("profiles")
      .select("id, full_name, status, created_at")
      .eq("role", "instrutor")
      .order("created_at", { ascending: false }),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);
  if (profilesError || usersError) {
    console.error("Falha ao listar instrutores:", profilesError?.message || usersError?.message);
    return res.status(503).json({ error: "Não foi possível carregar a lista de instrutores." });
  }

  const emailById = new Map(users.users.map(user => [user.id, user.email || ""]));
  return res.json({
    instructors: profiles.map(profile => ({
      id: profile.id,
      fullName: profile.full_name,
      email: emailById.get(profile.id) || "",
      status: profile.status,
      createdAt: profile.created_at
    }))
  });
});

// Convida a pessoa e só então dá a ela o papel de instrutor.
app.post("/api/admin/instructors/invite", requireAuth, requireAdmin, async (req, res) => {
  const { name, email } = req.body || {};
  if (typeof name !== "string" || !name.trim() ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Informe o nome e um e-mail válido." });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return res.status(503).json({ error: "Configure SUPABASE_SECRET_KEY no backend para enviar convites." });
  }

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
    data: { full_name: name.trim() },
    redirectTo: `${frontendUrl}/email-confirmed.html`
  });
  if (error || !data.user) {
    if (error?.status === 429) {
      return res.status(429).json({ error: "Limite de envio atingido. Aguarde antes de convidar novamente." });
    }
    console.error("Falha ao convidar instrutor:", error?.message || "Supabase não retornou o usuário.");
    return res.status(400).json({
      error: "Não foi possível enviar o convite. O e-mail pode já estar cadastrado ou a entrega de e-mails pode não estar configurada."
    });
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ full_name: name.trim(), role: "instrutor", status: "ativo" })
    .eq("id", data.user.id);
  if (profileError) {
    console.error("Convite criado, mas falhou ao atribuir o papel de instrutor:", profileError.message);
    return res.status(503).json({
      error: "O convite foi enviado, mas não foi possível configurar o perfil. Contate o administrador do sistema."
    });
  }

  return res.status(201).json({
    message: `Convite enviado para ${email.trim()}. O instrutor deverá definir a senha pelo link recebido.`
  });
});

// Se algo escapar do esperado, registra no servidor e responde sem despejar detalhes no site.
app.use((error, _req, res, _next) => {
  console.error("Erro inesperado na API:", error);
  res.status(500).json({ error: "Erro interno do servidor." });
});

// Sobe o servidor na porta configurada; se não houver uma, usa a padrão do projeto.
const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
