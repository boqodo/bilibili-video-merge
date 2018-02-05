# 项目功能

> 基于 bilibili win10客户端下载的Flv视频，有部分是分散在多个文件中的，需要合并成一个整体的视频文件的考虑，用nodejs尝试进行合并操作；

## 文件说明

- bilibilimerge.js  bilibili客户端下载到本地的flv文件合并，依赖[ffmpeg][ffmpeg]处理合并，[yamdi][yamdi]处理元信息
- bilibilidownloader.js 基于puppeteer的抓取bilibili页面请求信息，下载文件并做合并（依赖[ffmpeg][ffmpeg]）处理，[yamdi][yamdi]处理元信息
- progressmanager.js    下载进度显示处理
- flvmeta.js        flv文件元信息提取
- flvmeta.test.js   flv元信息测试文件
- flvmerge.js       flv文件合并
- flvmerge.test.js  flv合并测试文件

## 功能列表

- [x] 提取flv的元信息
- [ ] 合并多个flv流信息
- [ ] 重写元信息（关键帧和时间长度等）

## puppeteer

1. `yarn add puppeteer --ignore-scripts`  不安装Chromium，使用chrome处理

---

## Flv 格式解析知识点

> 格式的解析过程主要[参考][flv1]，其中有些没有明确的内容进行记录

### 第一部分 Header

> 9个字节，固定长度

### 第二部分 Body

> 由 `4个字节(表示上一个tag整体长度) + Tag` 循环叠加而成 
> Header后的第一个4个字节为 00 00 00 00，因为它之前并没有Tag

#### 脚本Tag (Tag类型=18)

> 脚本Tag一般只有一个，是flv的第一个Tag，用于存放flv的信息

格式： 数据类型+（数据长度）+数据

| 数据类型                | 数据长度字节数 | 数据内容 |
|------------------------|---------------|------|
| 0 = Number type        | 8字节     | 8个字节的值就是number的值    |
| 1 = Boolean type       | 1字节     | 1个字节的值，1为true，0为false    |
| 2 = String type        | 2字节     | 2个字节的值为数据内容的长度，读取对应长度即为数据内容    |
| 3 = Object type        | 2字节     | 2个字节的值为数据内容的长度，读取对应的长度即为数据内容，接下来的第1个字节为数据类型，根据数据类型获取对应的数据(可嵌套)，最终整个以 000009 结尾(3个字节的数据，值为9)   |
| 4 = MovieClip type     |      |     |
| 5 = Null type          |      |     |
| 6 = Undefined type     |      |     |
| 7 = Reference type     | 2个字节     |     |
| 8 = ECMA array type    | 4字节     | 4个字节的值为后续对应数据的个数(即数组长度)，数组中的每个值，类似键值对，键都是string类型，所以直接读取2个字节判定string长度，值类型非固定，最终整个以 000009 结尾(3个字节的数据，值为9)    |
| 10 = Strict array type | 4字节     | 4个字节的值为后续对应数据的个数(即数组长度)，数组中的每个值，非固定类型，读取1个字节判定   |
| 11 = Date type         | 10字节     | 8个字节为Double,时间戳毫秒数,后2个字节为有符号的数字    |
| 12 = Long string type  | 4字节     |类似string type，只是长度不同    |

## 参考

### 已有项目

1.[flvmeta](https://github.com/noirotm/flvmeta/) c/c++版本的flv元信息编辑

2.[node-flvmeta](https://github.com/patriksimek/node-flvmeta/) 基于flvmeta封装的node版本

3.[BiliBiliMerge](https://gitee.com/chengww5217/BiliBiliMerge)  java版本

4.[C# 版 flvmerge：快速合并多个flv文件](https://www.cnblogs.com/xiaotie/p/3441030.html)

5.[node-flv](https://github.com/TooTallNate/node-flv)

### 相关资料

- [FLV文件结构解析](http://blog.csdn.net/huibailingyu/article/details/42878381)
- [FLV文件格式解析][flv1]
- [也说FLV格式分析（C语言从0开始，详解，完整版](http://blog.csdn.net/spygg/article/details/53896179)

[flv1]: https://wuyuans.com/2012/08/flv-format/  "FLV文件格式解析"
[ffmpeg]: http://ffmpeg.org/    "ffmpeg官方网站"
[yamdi]: http://yamdi.sourceforge.net/ "yamdi官方网站"