const ROSLIB = require('roslib');
const EventEmitter = require('events');

class Robot extends EventEmitter {
  constructor(ip) {
    super();
    this.ip = ip;
    this.ros = null;
    this.rosConnect = false;
    this.setupROS();
    setInterval(() => this.checkAndReconnect(), 3000);
  }

  setupROS() {
    this.ros = new ROSLIB.Ros({
      url: `ws://${this.ip}`
    });

    this.ros.on('connection', () => this.handleConnection());
    this.ros.on('error', (error) => this.handleError(error));
    this.ros.on('close', () => this.handleClose());

    this.ros.on('open', () => {
    console.log('WebSocket 已连接');

    // 发送消息
    this.ros.send(JSON.stringify({
        type: 'message',
        data: 'Hello Server'
    }));
});
  }

  handleConnection() {
    console.log(this.ip, '----------Connected to websocket server.');
    this.updateConnection(true);
  }

  handleError(error) {
    this.updateConnection(false);
  }

  handleClose() {
    console.log(this.ip, '----------------Connection to websocket server closed.');
    this.updateConnection(false);
  }

  updateConnection(rosConnect) {
    this.rosConnect = rosConnect;
    this.emit('connection', this.ip, rosConnect);
  }

  checkAndReconnect() {
    if (!this.rosConnect) this.setupROS();
  }

  Close() {
    this.ros.close();
  }

  Topic(name, messageType) {
    return new ROSLIB.Topic({
      ros: this.ros,
      name,
      messageType
    });
  }

  // Promise 化的 publish 操作
  publish(topicName, messageType, message) {
    const topic = this.Topic(topicName, messageType);
    return new Promise((resolve, reject) => {
      topic.publish(message, resolve, reject);
    });
  }

  // Promise 化的 subscribe 操作
  subscribeTopic(topicName, messageType, callback) {
    const topic = this.Topic(topicName, messageType);
    // return new Promise((resolve, reject) => {
    topic.subscribe((msg) => {
      callback(msg);
      // resolve();
    }, (error) => {
      console.log(`Error subscribing to ${topicName}:`, error);
      // reject(error);
    });
    // });
  }

  // ----------------------------- 发 布 消 息 （publish） -------------------------------------------

  // // 底盘、云台、机械臂控制
  // control(axes, buttons, frame_id) {
  //   const message = { header: { frame_id: frame_id || '/web' }, axes, buttons: buttons || Array(8).fill(0) };
  //   this.publish('/joy', 'sensor_msgs/Joy', message);
  // }

  // // 夹爪操控 seq:0  张开 seq：100 抓取
  // gripper({ num }) {
  //   const message = { seq: num, frame_id: 'open_close_gripper' };
  //   this.publish('/trig', 'std_msgs/Header', message);
  // }

  // // 底座标定
  // baseCalibration() {
  //   const message = { seq: 1, frame_id: 'zero_calibrate' };
  //   this.publish('/trig', 'std_msgs/Header', message);
  // }

  // // 重定位
  // initPose(poses) {
  //   const pose = mapInverseOffset(poses);
  //   this.publish('/initialpose', 'geometry_msgs/PoseWithCovarianceStamped', {header:{frame_id:'map',}, pose: { pose } });
  // }

  // // 发送任务
  // sendTask(d) {
  //   this.publish('/task_nodes', 'task/task_info', d);
  // }

  // // 导航
  // sendNav(data) {
  //   this.publish('/set_goal_node', 'std_msgs/String', { data });
  // }

  // // 取消导航
  // cancelNav() {
  //   this.publish('/move_base/cancel', 'actionlib_msgs/GoalID', { id: '' });
  // }

  // ----------------------------- 订 阅 消 息 （subscribe） -------------------------------------------

  // 消息反馈trig
  feedBack(callback){
    return this.subscribeTopic('/trig', 'std_msgs/Header', callback);
  }

  // 导航结束
  navEnd(callback) {
    return this.subscribeTopic('/move_base/result', 'move_base_msgs/MoveBaseActionResult', msg => callback(msg.status.status === 3));
  }

  // 路径
  navPath(callback) {
    return this.subscribeTopic('/move_base/GlobalPlanner/plan', 'nav_msgs/Path', callback);
  }

  // 任务状态
  taskState(callback) {
    return this.subscribeTopic('/task_node/task_state', 'task/task_state', callback);
  }

  // 机器人姿态
  robotPose(callback) {
    return this.subscribeTopic('/robot_pose', 'geometry_msgs/Pose', callback);
  }

  // 电量、速度
  bunkerStatus(callback) {
    return this.subscribeTopic('/bunker_status', 'bunker_msgs/BunkerStatus', callback);
  }

  // --------------------------------------------------------
}

module.exports = Robot;
