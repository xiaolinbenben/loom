import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, InputNumber, Popconfirm, Space, Table, Typography } from "antd";
import {
  createAgent,
  deleteAgent,
  fetchAgents,
  fetchSkills,
  updateAgent,
  type InstalledSkill,
  type ManagedAgent,
} from "../lib/api";

interface AgentForm {
  id: string;
  name: string;
  summary: string;
  monthlyPrice: number;
  instructions: string;
  skills: string[];
}

const pageSize = 8;

export default function AgentsPage() {
  const [form] = Form.useForm<AgentForm>();
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const creating = editing === "new";

  const load = async () => {
    const [agentResult, skillResult] = await Promise.all([fetchAgents(), fetchSkills()]);
    setAgents(agentResult.data);
    setSkills(skillResult.data);
    return agentResult.data;
  };

  useEffect(() => {
    void load()
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "智能体读取失败"))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setError("");
    setSaved("");
    setEditing("new");
    form.setFieldsValue({ id: "", name: "", summary: "", monthlyPrice: 199, instructions: "", skills: [] });
  };

  const openEdit = (agent: ManagedAgent) => {
    setError("");
    setSaved("");
    setEditing(agent.id);
    form.setFieldsValue(agent);
  };

  const close = () => {
    setEditing(null);
    setError("");
    setSaved("");
  };

  const submit = async (values: AgentForm) => {
    setSaving(true);
    setError("");
    setSaved("");
    const payload: ManagedAgent = {
      id: values.id.trim(),
      name: values.name,
      summary: values.summary,
      monthlyPrice: values.monthlyPrice,
      included: false,
      instructions: values.instructions ?? "",
      skills: values.skills ?? [],
    };
    try {
      const result = creating ? await createAgent(payload) : await updateAgent(editing ?? "", payload);
      setSaved(result.message || "已保存");
      await load();
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    setSaved("");
    try {
      const result = await deleteAgent(id);
      setSaved(result.message || "已删除");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
    }
  };

  if (editing) {
    return (
      <div className="settings-page">
        <Typography.Text className="eyebrow">SYSTEM / AGENTS</Typography.Text>
        <Typography.Title level={2}>{creating ? "新建智能体" : "编辑智能体"}</Typography.Title>
        <Typography.Paragraph type="secondary">专业智能体 = Loomer + 协作指令 + 技能。</Typography.Paragraph>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => void submit(values)}>
          <Form.Item label="ID" name="id" rules={[{ required: creating, message: "请填写 ID" }]} extra="创建后不能修改。">
            <Input disabled={!creating} autoComplete="off" />
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: "请填写名称" }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item label="介绍" name="summary" rules={[{ required: true, message: "请填写介绍" }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="月费" name="monthlyPrice" rules={[{ required: true, type: "integer", min: 0, max: 100000, message: "月费必须是 0 到 100000 的整数" }]}>
            <InputNumber min={0} max={100000} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="协作指令" name="instructions" extra="加在 Loomer 执行方式之后。">
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item label="技能" name="skills" extra="只能选择已经安装的技能。">
            <Checkbox.Group options={skills.map((skill) => ({ label: skill.name, value: skill.name }))} />
          </Form.Item>
          {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
          {saved ? <Alert type="success" showIcon message={saved} style={{ marginBottom: 16 }} /> : null}
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
            <Button onClick={close}>返回</Button>
          </Space>
        </Form>
      </div>
    );
  }

  return (
    <div className="settings-page settings-page-wide">
      <Typography.Text className="eyebrow">SYSTEM / AGENTS</Typography.Text>
      <Typography.Title level={2}>智能体</Typography.Title>
      <Typography.Paragraph type="secondary">这里只管理类似电商运营的专业智能体。Loomer 在单独的页面编辑。</Typography.Paragraph>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      {saved ? <Alert type="success" showIcon message={saved} style={{ marginBottom: 16 }} /> : null}
      <Button type="primary" style={{ marginBottom: 16 }} onClick={openCreate}>新建</Button>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={agents}
        pagination={{ pageSize, hideOnSinglePage: false, showSizeChanger: false }}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "介绍", dataIndex: "summary", ellipsis: true },
          { title: "月费", dataIndex: "monthlyPrice", width: 100, render: (price: number) => `¥${price}` },
          {
            title: "操作",
            width: 140,
            render: (_value, agent) => (
              <Space>
                <Button type="link" onClick={() => openEdit(agent)}>编辑</Button>
                <Popconfirm title="删除这个智能体？" onConfirm={() => void remove(agent.id)}>
                  <Button type="link" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
