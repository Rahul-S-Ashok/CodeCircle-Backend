const Project = require("../models/project");
const ProjectMessage = require("../models/projectMessage");
const User = require("../models/user");

// ==========================================
// GET PROJECTS
// Gets projects created by user OR projects
// where user is a member
// ==========================================
const getProjects = async (req, res) => {
  try {
    const userId = req.user._id;

    const projects = await Project.find({
      $or: [
        { ownerId: userId },
        { members: userId },
      ],
    })
      .populate(
        "ownerId",
        "firstName lastName photoUrl headline"
      )
      .populate(
        "members",
        "firstName lastName photoUrl headline"
      )
      .sort({
        createdAt: -1,
      });

    res.json({
      data: projects,
    });
  } catch (err) {
    console.error("Get projects error:", err);

    res.status(400).json({
      message: err.message,
    });
  }
};

// ==========================================
// CREATE PROJECT
// ==========================================
const createProject = async (req, res) => {
  try {
    const {
      title,
      description,
      tags,
      lookingFor,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: "Title required",
      });
    }

    const project = await Project.create({
      ownerId: req.user._id,
      title: title.trim(),
      description: description?.trim() || "",
      tags: tags || [],
      lookingFor: lookingFor || [],
      members: [],
    });

    const populatedProject =
      await Project.findById(project._id)
        .populate(
          "ownerId",
          "firstName lastName photoUrl headline"
        )
        .populate(
          "members",
          "firstName lastName photoUrl headline"
        );

    res.status(201).json({
      data: populatedProject,
    });
  } catch (err) {
    console.error("Create project error:", err);

    res.status(400).json({
      message: err.message,
    });
  }
};

// ==========================================
// GET SINGLE PROJECT
// ==========================================
const getProjectById = async (req, res) => {
  try {
    const project =
      await Project.findById(req.params.id)
        .populate(
          "ownerId",
          "firstName lastName photoUrl headline"
        )
        .populate(
          "members",
          "firstName lastName photoUrl headline"
        );

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const userId =
      req.user._id.toString();

    const isOwner =
      project.ownerId._id.toString() ===
      userId;

    const isMember =
      project.members.some(
        (member) =>
          member._id.toString() === userId
      );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        message:
          "You are not a member of this project",
      });
    }

    res.json({
      data: project,
    });
  } catch (err) {
    console.error(
      "Get project error:",
      err
    );

    res.status(400).json({
      message: err.message,
    });
  }
};

// ==========================================
// SEARCH USERS FOR PROJECT MEMBER
// ==========================================
const searchProjectUsers = async (
  req,
  res
) => {
  try {
    const query = String(
      req.query.q || ""
    ).trim();

    if (!query) {
      return res.json({
        data: [],
      });
    }

    const users = await User.find({
      _id: {
        $ne: req.user._id,
      },

      $or: [
        {
          firstName: {
            $regex: query,
            $options: "i",
          },
        },
        {
          lastName: {
            $regex: query,
            $options: "i",
          },
        },
      ],
    })
      .select(
        "firstName lastName photoUrl headline"
      )
      .limit(10);

    res.json({
      data: users,
    });
  } catch (err) {
    console.error(
      "Search project users error:",
      err
    );

    res.status(500).json({
      message: "Unable to search users",
    });
  }
};

// ==========================================
// ADD PROJECT MEMBER
// ==========================================
const addProjectMember = async (
  req,
  res
) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        message: "User ID required",
      });
    }

    const project =
      await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    // Only owner can add members
    if (
      project.ownerId.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "Only project owner can add members",
      });
    }

    // Check that user actually exists
    const user = await User.findById(
      userId
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Owner cannot be added
    if (
      project.ownerId.toString() ===
      userId.toString()
    ) {
      return res.status(400).json({
        message:
          "Owner is already part of the project",
      });
    }

    // Prevent duplicate members
    const alreadyMember =
      project.members.some(
        (memberId) =>
          memberId.toString() ===
          userId.toString()
      );

    if (alreadyMember) {
      return res.status(400).json({
        message:
          "User is already a member",
      });
    }

    project.members.push(userId);

    await project.save();

    const updatedProject =
      await Project.findById(project._id)
        .populate(
          "ownerId",
          "firstName lastName photoUrl headline"
        )
        .populate(
          "members",
          "firstName lastName photoUrl headline"
        );

    res.json({
      message: "Member added successfully",
      data: updatedProject,
    });
  } catch (err) {
    console.error(
      "Add member error:",
      err
    );

    res.status(400).json({
      message: err.message,
    });
  }
};

// ==========================================
// REMOVE PROJECT MEMBER
// ==========================================
const removeProjectMember = async (
  req,
  res
) => {
  try {
    const project =
      await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    // Only owner can remove members
    if (
      project.ownerId.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "Only project owner can remove members",
      });
    }

    project.members =
      project.members.filter(
        (memberId) =>
          memberId.toString() !==
          req.params.memberId.toString()
      );

    await project.save();

    const updatedProject =
      await Project.findById(project._id)
        .populate(
          "ownerId",
          "firstName lastName photoUrl headline"
        )
        .populate(
          "members",
          "firstName lastName photoUrl headline"
        );

    res.json({
      message:
        "Member removed successfully",
      data: updatedProject,
    });
  } catch (err) {
    console.error(
      "Remove member error:",
      err
    );

    res.status(400).json({
      message: err.message,
    });
  }
};

// ==========================================
// GET PROJECT MESSAGES
// ==========================================
const getProjectMessages = async (
  req,
  res
) => {
  try {
    const project =
      await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const userId =
      req.user._id.toString();

    const isOwner =
      project.ownerId.toString() ===
      userId;

    const isMember =
      project.members.some(
        (memberId) =>
          memberId.toString() === userId
      );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        message:
          "You are not a project member",
      });
    }

    const messages =
      await ProjectMessage.find({
        projectId: project._id,
      })
        .populate(
          "senderId",
          "firstName lastName photoUrl"
        )
        .sort({
          createdAt: 1,
        });

    res.json({
      data: messages,
    });
  } catch (err) {
    console.error(
      "Get messages error:",
      err
    );

    res.status(400).json({
      message: err.message,
    });
  }
};

// ==========================================
// SEND PROJECT MESSAGE
// ==========================================
const sendProjectMessage = async (
  req,
  res
) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        message: "Message cannot be empty",
      });
    }

    const project =
      await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const userId =
      req.user._id.toString();

    const isOwner =
      project.ownerId.toString() ===
      userId;

    const isMember =
      project.members.some(
        (memberId) =>
          memberId.toString() === userId
      );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        message:
          "You are not a project member",
      });
    }

    const message =
      await ProjectMessage.create({
        projectId: project._id,
        senderId: req.user._id,
        text: text.trim(),
      });

    const populatedMessage =
      await ProjectMessage.findById(
        message._id
      ).populate(
        "senderId",
        "firstName lastName photoUrl"
      );

    res.status(201).json({
      data: populatedMessage,
    });
  } catch (err) {
    console.error(
      "Send message error:",
      err
    );

    res.status(400).json({
      message: err.message,
    });
  }
};

// ==========================================
// DELETE PROJECT
// ==========================================
const deleteProject = async (
  req,
  res
) => {
  try {
    const project =
      await Project.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.user._id,
      });

    if (!project) {
      return res.status(404).json({
        message:
          "Project not found or you are not the owner",
      });
    }

    await ProjectMessage.deleteMany({
      projectId: project._id,
    });

    res.json({
      message:
        "Project deleted successfully",
    });
  } catch (err) {
    console.error(
      "Delete project error:",
      err
    );

    res.status(400).json({
      message: err.message,
    });
  }
};

module.exports = {
  getProjects,
  createProject,
  getProjectById,
  searchProjectUsers,
  addProjectMember,
  removeProjectMember,
  getProjectMessages,
  sendProjectMessage,
  deleteProject,
};