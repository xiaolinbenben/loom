import { useEffect, useMemo, useState } from "react";
import { AppstoreOutlined, CloudServerOutlined, SettingOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { ProLayout } from "@ant-design/pro-components";
import { App as AntApp, Button, Card, ConfigProvider, Form, Input, Layout, Typography, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { fetchSession, login, logout } from "./lib/api";
import AgentsPage from "./pages/AgentsPage";
import LoomerPage from "./pages/LoomerPage";
import SettingsPage from "./pages/SettingsPage";
import SkillsPage from "./pages/SkillsPage";
import StoragePage from "./pages/StoragePage";

export default function App() {
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(() => window.location.hash.replace(/^#/, "") || "model");
  const routes = useMemo(() => ({
    path: "/admin",
    routes: [
      { path: "/admin/#model", name: "模型配置", icon: <SettingOutlined /> },
      { path: "/admin/#storage", name: "对象存储", icon: <CloudServerOutlined /> },
      { path: "/admin/#loomer", name: "Loomer", icon: <UserOutlined /> },
      { path: "/admin/#skills", name: "技能", icon: <AppstoreOutlined /> },
      { path: "/admin/#agents", name: "智能体", icon: <TeamOutlined /> },
    ],
  }), []);

  useEffect(() => {
    const sync = () => setPage(window.location.hash.replace(/^#/, "") || "model");
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    fetchSession()
      .then((result) => setUsername(result.data.username))
      .catch(() => setUsername(""))
      .finally(() => setReady(true));
  }, []);

  const signIn = async (values: { username: string; password: string }) => {
    setSubmitting(true);
    setError("");
    try {
      const result = await login(values.username, values.password);
      setUsername(result.data.username);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    await logout();
    setUsername("");
  };

  return (
    <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }} theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: "#1677ff", borderRadius: 6 } }}>
      <AntApp>
        {!ready ? null : username ? (
          <ProLayout
            title="Loom 后台"
            logo={false}
            route={routes}
            location={{ pathname: `/admin/#${page}` }}
            fixSiderbar
            menuItemRender={(item, dom) => <a href={item.path}>{dom}</a>}
            headerTitleRender={(logo, title) => <span className="header-title">{logo}{title}</span>}
            actionsRender={() => [
              <Button key="logout" type="text" onClick={() => void signOut()}>退出</Button>,
            ]}
          >
            <Layout.Content className="admin-content">
              {page === "storage" ? <StoragePage /> : page === "loomer" ? <LoomerPage /> : page === "skills" ? <SkillsPage /> : page === "agents" ? <AgentsPage /> : <SettingsPage />}
            </Layout.Content>
          </ProLayout>
        ) : (
          <main className="login-page">
            <Card className="login-card" title="Loom 后台">
              <Form layout="vertical" onFinish={(values) => void signIn(values)} requiredMark={false}>
                <Form.Item label="账号" name="username" rules={[{ required: true, message: "请填写账号" }]}>
                  <Input autoComplete="username" />
                </Form.Item>
                <Form.Item label="密码" name="password" rules={[{ required: true, message: "请填写密码" }]}>
                  <Input.Password autoComplete="current-password" />
                </Form.Item>
                {error ? <Typography.Paragraph type="danger">{error}</Typography.Paragraph> : null}
                <Button type="primary" htmlType="submit" loading={submitting} block>登录</Button>
              </Form>
            </Card>
          </main>
        )}
      </AntApp>
    </ConfigProvider>
  );
}
