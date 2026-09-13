const express = require("express");

const { userAuth } = require("../middlewares/auth");

const {
  getProjects,
  createProject,
  getProjectById,
  addProjectMember,
  removeProjectMember,
  getProjectMessages,
  sendProjectMessage,
  deleteProject,
} = require("../controllers/projectController");

const projectRouter = express.Router();


// ==========================================
// GET ALL PROJECTS CREATED BY USER
// ==========================================

projectRouter.get(
  "/",
  userAuth,
  getProjects
);


// ==========================================
// CREATE PROJECT
// ==========================================

projectRouter.post(
  "/",
  userAuth,
  createProject
);


// ==========================================
// GET SINGLE PROJECT
// ==========================================

projectRouter.get(
  "/:id",
  userAuth,
  getProjectById
);


// ==========================================
// ADD MEMBER TO PROJECT
// ==========================================

projectRouter.post(
  "/:id/members",
  userAuth,
  addProjectMember
);


// ==========================================
// REMOVE MEMBER
// ==========================================

projectRouter.delete(
  "/:id/members/:memberId",
  userAuth,
  removeProjectMember
);


// ==========================================
// GET PROJECT CHAT MESSAGES
// ==========================================

projectRouter.get(
  "/:id/messages",
  userAuth,
  getProjectMessages
);


// ==========================================
// SEND PROJECT MESSAGE
// ==========================================

projectRouter.post(
  "/:id/messages",
  userAuth,
  sendProjectMessage
);


// ==========================================
// DELETE PROJECT
// ==========================================

projectRouter.delete(
  "/:id",
  userAuth,
  deleteProject
);


module.exports = projectRouter;