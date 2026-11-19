import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, InputNumber, Typography } from "antd";
import { fetchStorage, saveStorage, type StorageSettings } from "../lib/api";

export default function StoragePage() {
  const [form] = Form.useForm<StorageSettings>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    void fetchStorage()
      .then((result) => form.setFieldsValue(result.data))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "配置读取失败"))
      .finally(() => setLoading(false));
  }, [form]);

  const submit = async (values: StorageSettings) => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const result = await saveStorage(values);
      setSaved(result.message || "已保存");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="storage" className="settings-page">
      <Typography.Text className="eyebrow">SYSTEM / STORAGE</Typography.Text>
      <Typography.Title level={2}>对象存储</Typography.Title>
      <Typography.Paragraph type="secondary">
        图片由电商运营智能体调用保存。地址按 path-style 生成，Bucket 需要允许公开读取。默认保存 14 天，超时后删除。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false} disabled={loading} initialValues={{ retentionDays: 14 }} onFinish={(values) => void submit(values)}>
        <Form.Item label="Endpoint" name="endpoint" rules={[{ required: true, message: "请填写 Endpoint" }]} extra="只填协议和主机，例如 https://s3.us-east-1.amazonaws.com。">
          <Input placeholder="https://s3.us-east-1.amazonaws.com" autoComplete="off" />
        </Form.Item>
        <Form.Item label="Region" name="region" rules={[{ required: true, message: "请填写 Region" }]}>
          <Input placeholder="us-east-1" autoComplete="off" />
        </Form.Item>
        <Form.Item label="Bucket" name="bucket" rules={[{ required: true, message: "请填写 Bucket" }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label="Access Key" name="accessKeyId" rules={[{ required: true, message: "请填写 Access Key" }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label="Secret Key" name="secretAccessKey" rules={[{ required: true, message: "请填写 Secret Key" }]}>
          <Input.Password autoComplete="off" />
        </Form.Item>
        <Form.Item label="保存天数" name="retentionDays" rules={[{ required: true, type: "integer", min: 1, max: 3650, message: "保存天数必须是 1 到 3650 的整数" }]}>
          <InputNumber min={1} max={3650} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
        {saved ? <Alert type="success" showIcon message={saved} style={{ marginBottom: 16 }} /> : null}
        <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
      </Form>
    </div>
  );
}
