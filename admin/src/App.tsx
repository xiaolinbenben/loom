import { useEffect, useMemo, useState } from "react";
import { CloudServerOutlined, SettingOutlined } from "@ant-design/icons";
import { ProLayout } from "@ant-design/pro-components";
import { App as AntApp, Button, Card, ConfigProvider, Form, Input, Layout, Typography, theme } from "antd";
import { fetchSession, login, logout } from "./lib/api";
import SettingsPage from "./pages/SettingsPage";
import StoragePage from "./pages/StoragePage";

export default function App() {
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const routes = useMemo(() => ({
    path: "/admin",
    routes: [
      { path: "/admin/#model", name: "模型配置", icon: <SettingOutlined /> },
      { path: "/admin/#storage", name: "对象存储", icon: <CloudServerOutlined /> },
    ],
  }), []);

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
    <ConfigProvider button={{ autoInsertSpace: false }} theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: "#1677ff", borderRadius: 6 } }}>
      <AntApp>
        {!ready ? null : username ? (
          <ProLayout
            title="Loom 后台"
            logo={false}
            route={routes}
            location={{ pathname: window.location.pathname }}
            fixSiderbar
            menuItemRender={(item, dom) => <a href={item.path}>{dom}</a>}
            headerTitleRender={(logo, title) => <span className="header-title">{logo}{title}</span>}
            actionsRender={() => [
              <Button key="logout" type="text" onClick={() => void signOut()}>退出</Button>,
            ]}
          >
            <Layout.Content className="admin-content">
              <SettingsPage />
              <StoragePage />
            </Layout.Content>
          </ProLayout>
        ) : (
          <main className="login-page">
            <Card className="login-card" title="Loom 后台">
              <Typography.Paragraph type="secondary">账号 admin，密码 admin123。不能在这里修改。</Typography.Paragraph>
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
