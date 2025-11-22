// 设置时区为东八区（必须在其他模块加载之前设置）
process.env.TZ = 'Asia/Shanghai';

const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const cors = require('./middleware/cors');
const errorHandler = require('./middleware/errorHandler');
const sequelize = require('./config/database');

// 初始化数据库连接（仅测试，不阻塞启动）
if (process.env.VERCEL) {
  // 在 Vercel 环境下，延迟测试数据库连接
  sequelize.authenticate()
    .then(() => console.log('数据库连接成功'))
    .catch(err => console.error('数据库连接失败:', err.message));
}

// 导入路由
const userRoutes = require('./routes/user');
const articleRoutes = require('./routes/article');
const commentRoutes = require('./routes/comment');
const webInfoRoutes = require('./routes/webInfo');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 8080;

// 中间件
app.use(cors);
app.use(bodyParser.json({ limit: '120mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '120mb' }));

// 路由
app.use('/user', userRoutes);
app.use('/article', articleRoutes);
app.use('/comment', commentRoutes);
app.use('/webInfo', webInfoRoutes);
app.use('/admin', adminRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// 错误处理中间件
app.use(errorHandler);

// 启动服务器（仅在非 serverless 环境下执行）
if (require.main === module) {
  async function startServer() {
    try {
      // 测试数据库连接
      await sequelize.authenticate();
      console.log('数据库连接成功');

      // 同步数据库（生产环境应该使用迁移）
      // await sequelize.sync({ alter: true });
      // console.log('数据库同步完成');

      app.listen(PORT, () => {
        console.log(`服务器运行在端口 ${PORT}`);
        console.log(`环境: ${process.env.NODE_ENV || 'dev'}`);
      });
    } catch (error) {
      console.error('启动服务器失败:', error);
      process.exit(1);
    }
  }

  startServer();
}

module.exports = app;
