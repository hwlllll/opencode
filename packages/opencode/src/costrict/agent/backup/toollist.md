
## 当前工具有哪些，方便自定义Agent时候工具选择和屏蔽

bash  命令行
edit 编辑文件
write 写文件
read  读文件
grep  使用正则查找文件
glob  查找文件
list 列出文件目录和文件路径
patch Apply patches to files.
skill 第三方技能
todowrite 写待办事项
todoread 读取待办事项
question 用户问卷
webfetch 获取网页
list_user_commands 列出用户命令


sequential-thinking 连续思考
file-outline 文件骨架，提取代码文件的结构信息，包括类、函数、方法定义和文档字符串
checkpoint 检查点（模型用，基于git，可以用来做检查点）


## 当前工具有哪些，方便自定义Agent时候工具选择和屏蔽

### 屏蔽task里面具体Agent方法
 permission:
  task:
    general: deny
    explore: deny   
    SubCodingAgent: deny

### Agent功能

#### 内置

general 复杂问题通用意图Agent
explore A fast, read-only agent for exploring codebases   


### 自研

SubCodingAgent 编码,写checkpoint