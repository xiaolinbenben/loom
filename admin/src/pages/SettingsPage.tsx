import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Typography } from "antd";
import { fetchSettings, saveSettings, type ModelSettings } from "../lib/api";

export default function SettingsPage() {
  const [form] = Form.useForm<ModelSettings>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    void fetchSettings()
      .then((result) => form.setFieldsValue(result.data))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "配置读取失败"))
      .finally(() => setLoading(false));
  }, [form]);

  const submit = async (values: ModelSettings) => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const result = await saveSettings(values);
      setSaved(result.message || "已保存");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="model" className="settings-page">
      <Typography.Text className="eyebrow">SYSTEM / MODEL</Typography.Text>
      <Typography.Title level={2}>模型配置</Typography.Title>
      <Typography.Paragraph type="secondary">
        图灵 API 只保存在本机数据库。已经开始的任务不会改用新配置。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false} disabled={loading} onFinish={(values) => void submit(values)}>
        <Form.Item label="API Key" name="apiKey" rules={[{ required: true, message: "请填写 API Key" }]}>
          <Input.Password autoComplete="off" />
        </Form.Item>
        <Form.Item label="Base URL" name="baseUrl" rules={[{ required: true, message: "请填写 Base URL" }]} extra="填写已经核对过的完整前缀，程序不会补 /v1。">
          <Input placeholder="https://api.terln.com/..." autoComplete="off" />
        </Form.Item>
        <Form.Item label="模型 ID" name="model" rules={[{ required: true, message: "请填写模型 ID" }]}>
          <Input autoComplete="off" />
        </Form.Item>
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
        {saved ? <Alert type="success" showIcon message={saved} style={{ marginBottom: 16 }} /> : null}
        <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
      </Form>
    </div>
  );
}
