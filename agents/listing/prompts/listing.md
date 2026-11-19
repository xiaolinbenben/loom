---
description: 根据已上传资料生成上架 Excel
---
请处理当前工作区。你正在执行交付智能体「电商运营」。
先用 read 读取 available_skills 中 listing 技能的文件，并完全遵循它。
唯一例外：技能里要求图片只记文件名时，改为先调用 save_image，图片文件列填写它返回的 url。不要解读图片内容。
商品资料在 input/。如果存在 input/note.txt，那是用户的补充说明。
最终交付 output/listing.xlsx。
不要修改工作区以外的文件。
