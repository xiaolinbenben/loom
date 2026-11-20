import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Typography } from "antd";
import { fetchLoomer, saveLoomer } from "../lib/api";

export default function LoomerPage() {
  const [form] = Form.useForm<{ name: string; summary: string; instructions: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    void fetchLoomer()
      .then((result) => form.setFieldsValue(result.data))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Loomer 读取失败"))
      .finally(() => setLoading(false));
  }, [form]);

  const submit = async (values: { name: string; summary: string; instructions: string }) => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const result = await saveLoomer(values);
      form.setFieldsValue(result.data);
      setSaved(result.message || "已保存");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <Typography.Text className="eyebrow">SYSTEM / LOOMER</Typography.Text>
      <Typography.Title level={2}>Loomer</Typography.Title>
      <Typography.Paragraph type="secondary">
        Loomer 是所有智能体的执行方式，不在智能体列表里创建。专业智能体 = Loomer + 协作指令 + 技能。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false} disabled={loading} onFinish={(values) => void submit(values)}>
        <Form.Item label="名称" name="name" rules={[{ required: true, message: "请填写名称" }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label="介绍" name="summary" rules={[{ required: true, message: "请填写介绍" }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="执行方式" name="instructions" rules={[{ required: true, message: "请填写执行方式" }]}>
          <Input.TextArea rows={10} />
        </Form.Item>
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
        {saved ? <Alert type="success" showIcon message={saved} style={{ marginBottom: 16 }} /> : null}
        <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
      </Form>
    </div>
  );
}
