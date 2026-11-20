import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, List, Popconfirm, Typography } from "antd";
import { fetchSkills, installSkill, uninstallSkill, type InstalledSkill } from "../lib/api";

export default function SkillsPage() {
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = async () => {
    const result = await fetchSkills();
    setSkills(result.data);
  };

  useEffect(() => {
    void load()
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "技能读取失败"))
      .finally(() => setLoading(false));
  }, []);

  const install = async (values: { name: string }) => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const result = await installSkill(values.name);
      setSaved(result.message || "已安装");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "安装失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (name: string) => {
    setError("");
    setSaved("");
    try {
      const result = await uninstallSkill(name);
      setSaved(result.message || "已删除");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
    }
  };

  return (
    <div id="skills" className="settings-page">
      <Typography.Text className="eyebrow">SYSTEM / SKILLS</Typography.Text>
      <Typography.Title level={2}>技能</Typography.Title>
      <Typography.Paragraph type="secondary">
        从本机 food4agent 安装到 skills。已经分配给智能体的技能不能删除。部署会上传这里安装好的副本。
      </Typography.Paragraph>
      <Form layout="inline" onFinish={(values) => void install(values)} style={{ marginBottom: 24 }}>
        <Form.Item name="name" rules={[{ required: true, message: "请填写技能名称" }]}>
          <Input placeholder="terln-image-gen" autoComplete="off" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>安装</Button>
      </Form>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      {saved ? <Alert type="success" showIcon message={saved} style={{ marginBottom: 16 }} /> : null}
      <List
        loading={loading}
        dataSource={skills}
        locale={{ emptyText: "还没有安装技能" }}
        renderItem={(skill) => (
          <List.Item
            actions={[
              <Popconfirm key="remove" title="删除这个技能？" onConfirm={() => void remove(skill.name)}>
                <Button type="link" danger disabled={skill.agents.length > 0}>删除</Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={skill.name}
              description={skill.agents.length > 0 ? `使用中：${skill.agents.map((agent) => agent.name).join("、")}` : skill.description || "未分配"}
            />
          </List.Item>
        )}
      />
    </div>
  );
}
